process.title = 'peer-to-peer';
var webSocketsServerPort = process.env.PORT || 8888;

var WebSocketServer = require('websocket').server;
var http = require('http');

// stuff for creating an app that is a WEBSOCKET and also serves STATIC FILES
var WebSocketServer = require('websocket').server;
var express         = require('express');
var app             = express();
var server          = app.listen(webSocketsServerPort, function() {
	console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

// create the web socket server (using the HTTP server as a basis)
var wsServer        = new WebSocketServer({ httpServer : server });

// this will make Express serve your static files (from the folder /public)
app.use(express.static(__dirname + '/public'));

// Global variable that contains all games currently being played!
var rooms = {}

// WebSocket server
wsServer.on('request', function(request) {
	// accept the connection
	var connection = request.accept(null, request.origin);

	// create a persistent variable for our roomID; means we don't need to look it up all the time, which is faster
	var roomID = -1;
	var isServer = false;

	// The most important callback: we'll handle all messages from users here.
	connection.on('message', function(message) {
		// a message is always a JSON object
		//  => type = 'utf8'
		//  => utf8Data = 'contains whatever I sent' => a STRING that needs to be converted to JSON
		// message = JSON.parse(message);
		message = JSON.parse(message.utf8Data);

		//
		// if this message is a CREATE ROOM message
		//
		if(message.action == "createRoom") {
			// generate a (non-existing) ID
			var id = generateID();

			// insert it into rooms (effectively creating a new room)
			// each room simply knows which socket is the server, and which are the players
			rooms[id] = {
				"server": connection,
				"players": [],
				"gameStarted": false
			};

			// remember our roomID
			roomID = id;

			// rember we function as a server
			isServer = true;

			// beam the room number back to the connection
			connection.sendUTF(JSON.stringify({ "type": "confirmRoom", "room": roomID }));

		//
		// if this message is a JOIN ROOM message
		//
		} else if(message.action == "joinRoom") {
			// which room should we join?
			var roomToJoin = message.room

			// what is the player username?
			var usn = message.username

			// if the username is too long, truncate it
			// (just in case some lunatic tries to crash the server)
			if(usn.length >= 20) {
				usn = usn.substring(0,20);
			} 

			// check if room exists; if not, return error message to player
			if(rooms[roomToJoin] == undefined || rooms[roomToJoin] == null) {
				// console.log("Error: someone tried to join nonexistent room (" + roomToJoin + ")");
				var msg = { 'type': 'error', 'val': 'wrong room' };
				connection.sendUTF( JSON.stringify(msg) );
				return;
			}

			// if the game has already started, this can only be a RECONNECT
			// thus, check if the username already exists; if not, return and do nothing
			if(rooms[roomToJoin].gameStarted) {
				if(rooms[roomToJoin].players[usn] == undefined) {
					var msg = { 'type': 'error', 'val': 'no player' };
					connection.sendUTF( JSON.stringify(msg) );
					return;
				}

			// otherwise, if the game is still accepting players ...
			} else {
				// does the username already exist? If so, add random characters to the end until it's unique
				while(rooms[roomToJoin].players[usn] != undefined) {
					var randChar = "abcdefghijklmnopqrstuvwxyz0123456789"
					usn = usn + randChar.charAt( Math.floor(Math.random() * randChar.length) )
				}
			}

			// add this player to that room
			rooms[roomToJoin].players[usn] = connection;

			// remember we joined the room
			roomID = roomToJoin;

			// we want to connect with the server (peer-to-peer)
			// for this, the player generates an "invitation" or "offer"
			// it sends this along with the message
			var offer = message.offer;

			// append the USERNAME of the client extending the offer
			// (otherwise, the server doesn't know to whom the response needs to be send)
			offer.clientUsername = usn;

			// now relay this offer to the server
			rooms[roomToJoin].server.sendUTF(JSON.stringify(offer));

		//
		// if this message is an OFFER RESPONSE
		//
		} else if(message.action == "offerResponse") {
			// get the client that should receive it
			var receivingClient = message.clientUsername

			// get the response
			var offerResponse = message.response;

			// send the response
			rooms[roomID].players[receivingClient].sendUTF(JSON.stringify(offerResponse));

		//
		// if this message is a START GAME signal
		//
		} else if(message.action == 'startGame') {
			rooms[roomID].gameStarted = true;
		}
	});

	// user connection closed
	connection.on('close', function(connection) {
		// if we were the server of a game, remove that whole game
		if(isServer) {
			delete rooms[roomID];
		}
	});
});

function generateID() {
	var id = "SHIP";

    do {
      id = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" //abcdefghijklmnopqrstuvwxyz0123456789";
      for (var i = 0; i < 4; i++)
        id += possible.charAt(Math.floor(Math.random() * possible.length));
    } while (rooms[id] != undefined);

    return id;
}