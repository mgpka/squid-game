const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// حد نقل البيانات 100MB لدعم المايك والأغاني بدقة بدون انقطاع
const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

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

    socket.on('verifyJoin', (data, callback) => {
        if (data.pass !== gameState.roomPass) {
            return callback({ success: false, message: 'رمز الدخول خاطئ!' });
        }
        
        const isNumTaken = Object.values(gameState.players).some(p => p.number === data.number && p.id !== socket.id);
        if (isNumTaken && !data.isFrontMan) {
            return callback({ success: false, message: 'هذا الرقم مستخدم حالياً من قبل لاعب آخر!' });
        }

        gameState.players[socket.id] = {
            id: socket.id,
            name: data.name,
            number: data.number,
            gender: data.gender || 'male',
            isFrontMan: data.isFrontMan || false,
            x: 0, y: 1.6, z: 10,
            rotationY: 0,
            rotationX: 0,
            health: 100
        };

        callback({ success: true });
        socket.broadcast.emit('newPlayerJoined', gameState.players[socket.id]);
        io.emit('updatePlayerList', Object.values(gameState.players));
        socket.emit('currentPlayers', gameState.players);
    });

    socket.on('playerMove', (data) => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].x = data.x;
            gameState.players[socket.id].y = data.y;
            gameState.players[socket.id].z = data.z;
            gameState.players[socket.id].rotationY = data.rotationY;
            gameState.players[socket.id].rotationX = data.rotationX;
            socket.broadcast.emit('playerMoved', gameState.players[socket.id]);
        }
    });

    // بث المايك والموسيقى
    socket.on('adminAudioStream', (audioBuffer) => socket.broadcast.emit('receiveAdminVoice', audioBuffer));
    socket.on('playerVoiceStream', (audioBuffer) => {
        if(!gameState.globalMute) socket.broadcast.emit('receivePlayerVoice', { id: socket.id, buffer: audioBuffer });
    });
    socket.on('adminMusicControl', (data) => io.emit('syncMusic', data));

    socket.on('adminLogin', (pass, callback) => {
        if (pass === ADMIN_PASSWORD) {
            socket.join('admin-room');
            callback({ success: true, roomPass: gameState.roomPass, players: Object.values(gameState.players) });
        } else callback({ success: false, message: 'كلمة السر خاطئة' });
    });

    socket.on('adminKickPlayer', (targetSocketId) => {
        if (io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('kickedFromGame');
            delete gameState.players[targetSocketId];
            io.emit('playerDisconnected', targetSocketId);
            io.emit('updatePlayerList', Object.values(gameState.players));
        }
    });

    socket.on('adminEditPlayer', (data) => {
        if (gameState.players[data.id]) {
            gameState.players[data.id].name = data.name;
            gameState.players[data.id].number = data.number;
            io.emit('updatePlayerList', Object.values(gameState.players));
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

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('playerDisconnected', socket.id);
        io.emit('updatePlayerList', Object.values(gameState.players));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل باحترافية على المنفذ: ${PORT}`));
