const socket = io();
const divEl = document.querySelector(".buttons");

document.getElementById('submitButton').addEventListener('click', () => {
    const roomName = document.getElementById('roomInput').value.trim();
    if (roomName) {
        socket.emit('roomName', roomName);
        document.getElementById('roomInput').value = ""; // Clear the input field
    }
});

socket.on('roomName', (roomName) => {
    // Create a button element with a dynamic click event
    const button = document.createElement('button');
    button.textContent = roomName;
    button.addEventListener('click', () => {
        window.location.href = `/${roomName}`;
    });
    divEl.appendChild(button);
});
