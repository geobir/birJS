var os = require('os');
var static = require('node-static');
var http = require('http');
var socketIO = require('socket.io');


var fileServer = new(static.Server)();
var app = http.createServer(function (req, res) {
  fileServer.serve(req, res);
}).listen(10542);

var io = socketIO.listen(app);

// All Socket IO Rooms
rooms = {};

io.sockets.on('connection', function (socket){


	// signaling message between peers
	/**
	 * Send message between clients
	 * @param  {String}		The socket IO id of the targeted client
	 * @param  {String}		The message
	 */
	socket.on('signalingMessage', function (id ,message) {
		socket.to(id).emit('signalingMessage', socket.id, message);
	});

	/**
	 * Create or join the eocket IO room
	 * @param  {String}		The socket IO room you want to join
	 */
	socket.on('create_or_join', function (room) {
		if (!rooms[room]){
			rooms[room] = [];
		}
		var numClients = numOfClients(room);
		var clientID = socket.id;
		console.log("\x1b[32mcreate or join\x1b[0m", room, " user(s) already in this room:", numClients, " join by:", clientID);
		socket.join(room);

		socket.emit('joined', room, clientID, rooms[room]);
		rooms[room].push(clientID);
	});

	/**
	 * When a client disconnect to the room
	 * @param  {String}
	 */
	socket.on('disconnect', function() {
		console.log("\x1b[31mDisconnect:\x1b[0m id = ", socket.id);
		for (var room in rooms) {
			if (rooms[room].includes(socket.id)){
				rooms[room].splice( rooms[room].indexOf(socket.id), 1 );
			}
		}
	})

});

/**
 * Return the number of client in
 * @param  {String}		The room
 * @return {int}		The number of client in
 */
function numOfClients(room){
	return (io.sockets.adapter.rooms[room] || {length: 0}).length;
}