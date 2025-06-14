const socket = io("https://quickstock-4.onrender.com"); // IMPORTANT: connect to the correct port
//const socket = io("http://localhost:5500"); -> use this line instead of the above line when you want t run your web in localhost
const itemIdInput = document.getElementById('itemId');
const itemNameInput = document.getElementById('itemName');
const sendAlertBtn = document.getElementById('sendAlertBtn');
const statusDiv = document.getElementById('status');

// Optional: map some IDs to names for testing
const itemNameMap = {
  x1: 'Screwdriver',
  x2: 'Hammer',
  x3: 'Wrench',
};

itemIdInput.addEventListener('input', () => {
  const id = itemIdInput.value.toLowerCase();
  itemNameInput.value = itemNameMap[id] || 'Unknown Item';
});

sendAlertBtn.addEventListener('click', () => {
  const itemId = itemIdInput.value.trim();
  const itemName = itemNameInput.value;

  if (!itemId || itemName === 'Unknown Item') {
    alert('Please enter a valid item ID.');
    return;
  }

  const alertData = { itemId, itemName };
  socket.emit('send_alert', alertData); // send to server

  statusDiv.innerText = '✅ Sent alert to supplier!';
  itemIdInput.value = '';
  itemNameInput.value = '';

  setTimeout(() => {
  statusDiv.innerText = '';
}, 3000);
}); 