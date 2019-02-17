//也可以写入全局 TODO::多进程化
let _config = require("./config/config.js");
let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let ejs = require('ejs');
let routers = require('./routers/routers');  //用于测试
var num = 0;

var redis = require('redis');
var redisClient = redis.createClient;

// let redisCon = require("./serv/redis")(_config.redis);
// let mysqlHandler = require("./serv/mysql")(_config.db);

//init
http.on('error', onError);
app.engine('html', ejs.renderFile);
app.set("view engine", "html");
routers(app, _config);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.message = err.message;
    // render the error page
    res.status(err.status || 500);
    res.send('error');
});


//建立redis pub、sub连接
var pub = redisClient({port: 6379, host: '127.0.0.1', password: ''});
var sub = redisClient({port: 6379, host: '127.0.0.1', password: ''});


var roomSet = {};


io.on('connection', function (socket) {

    // http://127.0.0.1:3000?roomid='+ roomid
    var roomid = socket.handshake.query.roomid;

    socket.on('join', function (data) {
        socket.join(roomid);

        if (!roomSet[roomid]) {
            roomSet[roomid] = {};
            console.log('sub channel ' + roomid);
            sub.subscribe(roomid);
        }

        roomSet[roomid][socket.id] = {};
        console.log(data.username + ' join, IP: ' + socket.client.conn.remoteAddress);
        roomSet[roomid][socket.id].username = data.username;

        pub.publish(roomid, JSON.stringify({"event": 'join', "data": data}));
    });


    socket.on('say', function (data) {
        console.log("Received Message: " + data.text);
        pub.publish(roomid, JSON.stringify({
            "event": 'broadcast_say', "data": {
                username: roomSet[roomid][socket.id].username,
                text: data.text
            }
        }));
    });


    socket.on('disconnect', function () {
        num--;
        if (roomSet[roomid] && roomSet[roomid][socket.id] && roomSet[roomid][socket.id].username) {
            console.log(roomSet[roomid][socket.id].username + ' quit');
            pub.publish(roomid, JSON.stringify({
                "event": 'broadcast_quit', "data": {
                    username: roomSet[roomid][socket.id].username
                }
            }));
        }
        roomSet[roomid] && roomSet[roomid][socket.id] && (delete roomSet[roomid][socket.id]);

    });
});

// subscribe listen
sub.on("subscribe", function (channel, count) {
    console.log('worker pid: ' + ' subscribe: ' + channel);
});

// message listen
sub.on("message", function (channel, message) {
    console.log("message channel " + channel + ": " + message);
    io.to(channel).emit('message', JSON.parse(message));
});

console.log("start");
http.listen(_config.port);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = _config.port;

    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            break;
        default:
            throw error;
    }
}
