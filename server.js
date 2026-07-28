const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

let gameState = {
    isStarted: false,
    countdown: 0,
    roomPass: "sqpr",
    pvpEnabled: false,
    globalMute: false,
    players: {}
};

const ADMIN_PASSWORD = "admin123";

io.on('connection', (socket) => {
    console.log(`متصل جديد: ${socket.id}`);

    // التحقق من رمز الغرفة ورقم اللاعب
    socket.on('verifyJoin', (data, callback) => {
        if (data.pass !== gameState.roomPass) {
            return callback({ success: false, message: 'رمز الدخول خاطئ!' });
        }
        
        const isNumTaken = Object.values(gameState.players).some(p => p.number === data.number && p.id !== socket.id);
        if (isNumTaken) {
            return callback({ success: false, message: 'هذا الرقم مستخدم حالياً من قبل لاعب آخر!' });
        }

        gameState.players[socket.id] = {
            id: socket.id,
            name: data.name,
            number: data.number,
            gender: data.gender || 'male',
            isFrontMan: data.isFrontMan || false,
            x: 0, y: 1.6, z: 0,
            rotationY: 0,
            health: 100
        };

        callback({ success: true });
        socket.broadcast.emit('newPlayerJoined', gameState.players[socket.id]);
        io.emit('updatePlayerCount', Object.keys(gameState.players).length);
        socket.emit('currentPlayers', gameState.players);
    });

    // تحديث حركة اللاعب
    socket.on('playerMove', (data) => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].x = data.x;
            gameState.players[socket.id].y = data.y;
            gameState.players[socket.id].z = data.z;
            gameState.players[socket.id].rotationY = data.rotationY;
            socket.broadcast.emit('playerMoved', gameState.players[socket.id]);
        }
    });

    // ضرب اللاعبين (Punch / PvP)
    socket.on('playerPunch', (targetId) => {
        if (gameState.pvpEnabled && gameState.players[targetId]) {
            gameState.players[targetId].health -= 20;
            io.emit('playerHit', { id: targetId, health: gameState.players[targetId].health });
        }
    });

    // لوحة التحكم Admin
    socket.on('adminLogin', (pass, callback) => {
        if (pass === ADMIN_PASSWORD) {
            socket.join('admin-room');
            callback({ success: true, roomPass: gameState.roomPass });
        } else {
            callback({ success: false, message: 'كلمة السر خاطئة' });
        }
    });

    socket.on('adminChangePass', (newPass) => {
        gameState.roomPass = newPass;
        io.to('admin-room').emit('passUpdated', newPass);
    });

    socket.on('adminTogglePvP', (enabled) => {
        gameState.pvpEnabled = enabled;
        io.emit('pvpStatusChanged', enabled);
    });

    socket.on('adminToggleGlobalMute', (muted) => {
        gameState.globalMute = muted;
        io.emit('globalMuteChanged', muted);
    });

    socket.on('adminStartGame', (sec) => {
        gameState.isStarted = true;
        gameState.countdown = sec || 10;
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
        io.emit('playerDisconnected', socket.id);
        io.emit('updatePlayerCount', Object.keys(gameState.players).length);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`));
