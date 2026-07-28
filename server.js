const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    isStarted: false,
    currentStage: 1,
    countdown: 0,
    players: {}
};

const ADMIN_PASSWORD = "admin123"; // كلمة السر للوحة التحكم

io.on('connection', (socket) => {
    console.log(`لاعب جديد متصل: ${socket.id}`);

    socket.emit('gameStateUpdate', gameState);

    socket.on('adminLogin', (pass, callback) => {
        if (pass === ADMIN_PASSWORD) {
            socket.join('admin-room');
            callback({ success: true });
        } else {
            callback({ success: false, message: 'كلمة السر خاطئة' });
        }
    });

    socket.on('adminStartGame', (countdownTime) => {
        gameState.isStarted = true;
        gameState.countdown = countdownTime || 10;
        
        io.emit('gameStarting', { countdown: gameState.countdown });

        let timer = setInterval(() => {
            gameState.countdown--;
            io.emit('countdownTick', gameState.countdown);

            if (gameState.countdown <= 0) {
                clearInterval(timer);
                io.emit('gameStarted');
            }
        }, 1000);
    });

    socket.on('adminAudioStream', (audioChunk) => {
        socket.broadcast.emit('receiveAdminVoice', audioChunk);
    });

    socket.on('adminMusicControl', (data) => {
        io.emit('syncMusic', data);
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// المنفذ الخاص بـ Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
