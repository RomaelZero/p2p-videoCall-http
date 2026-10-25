'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

// On Render, set APP_ORIGIN to your exact HTTPS website URL (no trailing slash).
// For local testing, localhost is allowed by default.
const allowedOrigins = new Set(
  (process.env.APP_ORIGIN || `http://localhost:${PORT},http://127.0.0.1:${PORT}`)
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

const io = new Server(httpServer, {
  cors: { origin: [...allowedOrigins], methods: ['GET', 'POST'] },
  maxHttpBufferSize: 128 * 1024,
  // CORS by itself does not protect WebSocket connections.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    callback(null, !origin || allowedOrigins.has(origin));
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Preserve named public rooms, while blocking markup, path separators and huge names.
function validRoom(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(name);
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:room', (req, res) => {
  const roomName = req.params.room;
  if (!validRoom(roomName)) return res.status(400).send('Invalid room name');
  res.render('room', { roomName });
});

// A modest per-connection throttle; it does not replace network-level rate limiting.
function withinLimit(socket) {
  const now = Date.now();
  let state = socket.data.eventCounter;
  if (!state || now - state.started >= 10000) {
    state = { started: now, count: 0 };
    socket.data.eventCounter = state;
  }
  state.count += 1;
  return state.count <= 200;
}

// The existing public-room client rejoins here after Socket.IO reconnects.
function joinRoom(socket, roomName) {
  if (!validRoom(roomName)) return false;
  if (socket.data.roomName && socket.data.roomName !== roomName) return false;
  socket.join(roomName);
  socket.data.roomName = roomName;
  return true;
}

function isRoomMember(socket, roomName) {
  return validRoom(roomName) &&
    socket.data.roomName === roomName &&
    socket.rooms.has(roomName);
}

io.on('connection', socket => {
  socket.on('roomName', roomName => {
    if (!withinLimit(socket) || !validRoom(roomName)) return;
    // Keep the existing public room directory.
    io.emit('roomName', roomName);
  });

  socket.on('joinRoom', roomName => {
    if (!withinLimit(socket)) return;
    joinRoom(socket, roomName);
  });

  socket.on('receiveidArray', (_claimedId, roomName) => {
    if (!withinLimit(socket) || !joinRoom(socket, roomName)) return;
    const ids = [...(io.sockets.adapter.rooms.get(roomName) || [])];
    // Show only the participants in this room, not users from other rooms.
    io.to(roomName).emit('receiveidArray',
      ids.map(socketId => ({ roomName, socketId })));
  });

  socket.on('msg', (_claimedId, roomName, msg) => {
    if (!withinLimit(socket) || !isRoomMember(socket, roomName)) return;
    if (typeof msg !== 'string' || msg.length > 2000) return;
    // Never trust a sender ID provided by the browser.
    io.to(roomName).emit('msg', socket.id, msg);
  });

  socket.on('offer', (offer, roomName) => {
    if (!withinLimit(socket) || !isRoomMember(socket, roomName)) return;
    if (!offer || offer.type !== 'offer' || typeof offer.sdp !== 'string' || offer.sdp.length > 60000) return;
    // Include the sender to preserve the original offer/answer client behavior.
    io.to(roomName).emit('offer', offer);
  });

  socket.on('answer', (answer, roomName) => {
    if (!withinLimit(socket) || !isRoomMember(socket, roomName)) return;
    if (!answer || answer.type !== 'answer' || typeof answer.sdp !== 'string' || answer.sdp.length > 60000) return;
    io.to(roomName).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate, roomName) => {
    if (!withinLimit(socket) || !isRoomMember(socket, roomName)) return;
    if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 8000) return;
    io.to(roomName).emit('ice-candidate', candidate);
  });
});

httpServer.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});
