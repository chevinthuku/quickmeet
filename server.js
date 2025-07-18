const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Route for room
app.get('/r/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/room.html'));
});

let rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId }) => {
    if (!rooms[roomId]) rooms[roomId] = [];

    if (rooms[roomId].length >= 6) {
      socket.emit('room-full');
      return;
    }

    rooms[roomId].push(socket.id);
    socket.join(roomId);

    // Inform existing users
    socket.emit('peers', rooms[roomId].filter(id => id !== socket.id));
    socket.to(roomId).emit('user-joined', socket.id);

    // Signaling
    socket.on('offer', (data) => socket.to(data.to).emit('offer', { from: socket.id, offer: data.offer }));
    socket.on('answer', (data) => socket.to(data.to).emit('answer', { from: socket.id, answer: data.answer }));
    socket.on('ice-candidate', (data) => socket.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate }));

    // Chat & reactions
    socket.on('chat-message', (msg) => io.to(roomId).emit('chat-message', { user: socket.id, text: msg }));
    socket.on('reaction', (emoji) => io.to(roomId).emit('reaction', { user: socket.id, emoji }));

    // Disconnect
    socket.on('disconnect', () => {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
