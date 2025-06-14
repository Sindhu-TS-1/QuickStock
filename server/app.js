const express = require('express');
const http = require('http');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// === FILE PATHS ===
const ALERTS_FILE = path.join(__dirname, 'alerts.json');
const OUT_OF_STOCK_LOG = path.join(__dirname, 'out_of_stock_log.xlsx');
const DISPATCH_LOG = path.join(__dirname, 'dispatched_items_log.xlsx');
const usersPath = path.join(__dirname, 'users.json');

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../client')));

// === INIT FILES IF NOT EXISTS ===
if (!fs.existsSync(ALERTS_FILE)) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify([]));
}

// === SOCKET LOGIC ===
io.on('connection', (socket) => {
  console.log('Worker connected');

  socket.on('send_alert', (data) => {
    console.log('📦 Low stock alert received:', data);
    io.emit("supplierNotification", data);

    // Save alert
    let alerts = [];
    if (fs.existsSync(ALERTS_FILE)) {
      alerts = JSON.parse(fs.readFileSync(ALERTS_FILE));
    }
    alerts.push({
      ...data,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));

    io.emit('send_alert', data); // Broadcast to suppliers
  });

  socket.on('dispatchedItem', (itemData) => {
    console.log('📤 Marked as dispatched:', itemData);

    const logEntry = {
      ...itemData,
      dispatchedAt: new Date().toLocaleString()
    };
    logDispatchedItemToExcel(logEntry);
  });

  socket.on('stockUnavailable', (data) => {
    console.log('🚫 Out of Stock:', data);

    const workerSocketId = data.workerSocketId;
    if (workerSocketId) {
      io.to(workerSocketId).emit('stockUnavailable', {
        itemId: data.itemId,
        itemName: data.itemName,
      });
    }

    const logEntry = {
      ...data,
      markedUnavailableAt: new Date().toLocaleString()
    };
    logOutOfStockToExcel(logEntry);
  });

  socket.on('stockReplenished', (data) => {
    console.log('✅ Replenished:', data);

    if (data.workerSocketId) {
      io.to(data.workerSocketId).emit('stockReplenished', {
        itemId: data.itemId,
        itemName: data.itemName
      });
    }
  });

  socket.on('supplier_joined', () => {
    console.log('📡 Supplier joined');
    if (fs.existsSync(ALERTS_FILE)) {
      const alerts = JSON.parse(fs.readFileSync(ALERTS_FILE));
      socket.emit('previous_alerts', alerts);
    }
  });

  socket.on('disconnect', () => {
    console.log('Worker disconnected');
  });
});

// === ROUTES ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Register API
app.post('/api/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'All fields required' });
  }

  let users = [];
  if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath));
    if (users.find(u => u.username === username)) {
      return res.json({ success: false, message: 'User already exists' });
    }
  }

  users.push({ username, password, role });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  res.json({ success: true });
});

// Login API
app.post('/api/login', (req, res) => {
  const { username, password, role } = req.body;
  if (!fs.existsSync(usersPath)) {
    return res.json({ success: false, message: 'No users found' });
  }

  const users = JSON.parse(fs.readFileSync(usersPath));
  const user = users.find(u => u.username === username && u.password === password && u.role === role);

  if (!user) {
    return res.json({ success: false, message: 'Invalid credentials' });
  }

  const redirectPage = role === 'worker' ? '/worker.html' : '/supplier.html';
  res.json({ success: true, user: { username, role }, redirect: redirectPage });
});

// Logout
app.post('/logout', (req, res) => {
  req.session?.destroy?.((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  }) || res.json({ success: true }); // fallback
});

// === LOGGING FUNCTIONS ===
function logDispatchedItemToExcel(item) {
  let workbook, worksheet;

  if (fs.existsSync(DISPATCH_LOG)) {
    workbook = XLSX.readFile(DISPATCH_LOG);
    worksheet = workbook.Sheets['Dispatched'];
  } else {
    workbook = XLSX.utils.book_new();
    worksheet = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dispatched');
  }

  const data = XLSX.utils.sheet_to_json(worksheet);
  data.push(item);

  const newSheet = XLSX.utils.json_to_sheet(data);
  workbook.Sheets['Dispatched'] = newSheet;
  XLSX.writeFile(workbook, DISPATCH_LOG);
}

function logOutOfStockToExcel(item) {
  let workbook, worksheet;

  if (fs.existsSync(OUT_OF_STOCK_LOG)) {
    workbook = XLSX.readFile(OUT_OF_STOCK_LOG);
    worksheet = workbook.Sheets['OutOfStock'];
  } else {
    workbook = XLSX.utils.book_new();
    worksheet = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OutOfStock');
  }

  const data = XLSX.utils.sheet_to_json(worksheet);
  data.push(item);

  const newSheet = XLSX.utils.json_to_sheet(data);
  workbook.Sheets['OutOfStock'] = newSheet;
  XLSX.writeFile(workbook, OUT_OF_STOCK_LOG);
}

// === START SERVER ===
const PORT = process.env.PORT || 5500;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  //console.log(`✅ Server running at http://localhost:${PORT}`);   -> for local host
});




//https://quickstock-4.onrender.com   -> backend
//https://quickstock-5.onrender.com   -> frontend