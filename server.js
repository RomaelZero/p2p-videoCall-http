const http = require('http'); // Use http module instead of https
const { Server } = require('socket.io');
const express = require('express');
const path = require('path');

const app = express();

// HTTP server running on port 80
const httpServer = http.createServer(app); // Create HTTP server

// Socket.IO setup with the HTTP server
const io = new Server(httpServer, {
    cors: {
        origin: "*",
    }
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

app.set('view engine', 'ejs');

// Array with roomIds
let idArray = []; 

// Serve index.html
app.get("/", (req, res) => {
    console.log("Serving index.html");
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("/:room", (req, res) => {
    const roomName = req.params.room;
    console.log(`Serving room: ${roomName}`);
    res.render("room", { roomName: roomName });
});

io.on('connection', (socket) => {
    console.log('A user connected with socket id:', socket.id);

    socket.on("receiveidArray", (id, roomName) => {
        const finderVariable = idArray.find(arrayObject => arrayObject.socketId === id);

        if (!finderVariable) {
            idArray.push({ roomName: roomName, socketId: id });
        }

        console.log(`Updated idArray: ${JSON.stringify(idArray)}`);
        io.to(roomName).emit("receiveidArray", idArray);
    });

    socket.on("socket-id", (id) => {
        console.log("The received socket-id is " + id);
    });

    socket.on('roomName', (roomName) => {
        console.log(`Received roomName: ${roomName}`);
        io.sockets.emit("roomName", roomName);
    });

    socket.on('joinRoom', (roomName) => {
        console.log(`User joined room: ${roomName}`);
        socket.join(roomName);
    });

    socket.on("msg", (id, roomName, msg) => {
        console.log(`Message received from ${id} in room ${roomName}: ${msg}`);
        io.to(roomName).emit("msg", id, msg);
    });

    socket.on('disconnect', () => {
        console.log(`User with socket id ${socket.id} disconnected`);
        idArray = idArray.filter(arrayObject => arrayObject.socketId !== socket.id);
        console.log('Updated idArray after disconnection:', idArray);
    });

    socket.on("offer", (offer, roomName) => {
        io.to(roomName).emit("offer", offer);
    });

    socket.on("answer", (answer, roomName) => {
        io.to(roomName).emit("answer", answer);
    });

    socket.on("ice-candidate", (candidate, roomName) => {
        io.to(roomName).emit("ice-candidate", candidate);
    });
});

const PORT = process.env.PORT ||3000;

// Start the server on port 80
httpServer.listen(PORT, () => {
    console.log('HTTP server is running on port 80');
});
