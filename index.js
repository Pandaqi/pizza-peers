process.title = 'peer-to-peer';
var webSocketsServerPort = process.env.PORT || 8888;

var WebSocketServer = require('websocket').server;
var http = require('http');

/*
var server = http.createServer(function(request, response) {
  // process HTTP request. Since we're writing just WebSockets
  // server we don't have to implement anything.
});

server.listen(webSocketsServerPort, function() {
  console.log((new Date()) + " Server is listening on port "
      + webSocketsServerPort);
});
*/

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

	var roomID = -1;

	console.log("SOMEONE IS TRYING TO CONNECT");

	// This is the most important callback for us, we'll handle
	// all messages from users here.
	connection.on('message', function(message) {
		// a message is always a JSON object
		//  => type = 'utf8'
		//  => utf8Data = 'contains whatever I sent' => a STRING that needs to be converted to JSON
		// message = JSON.parse(message);
		message = JSON.parse(message.utf8Data);

		console.log("RECEIVED A MESSAGE" + message);

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
				"players": []
			};

			// remember our roomID
			roomID = id;

			console.log("Room created with name " + roomID);

			// beam the room number back to the connection
			connection.sendUTF(JSON.stringify({ "type": "confirmRoom", "room": roomID }));
		}

		//
		// if this message is a JOIN ROOM message
		//
		if(message.action == "joinRoom") {
			// which room should we join?
			var roomToJoin = message.room

			// what is the player username?
			var usn = message.username

			// does the username already exist? If so, add random characters to the end until it's unique
			while(rooms[roomToJoin].players[usn] != undefined) {
				var randChar = "abcdefghijklmnopqrstuvwxyz0123456789"
				usn = usn + randChar.charAt( Math.floor(Math.random() * randChar.length) )
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

			console.log("Someone is trying to join room " + roomID + " with offer " + offer);
		}

		//
		// if this message is an OFFER RESPONSE
		//
		if(message.action == "offerResponse") {
			// get the client that should receive it
			var receivingClient = message.clientUsername

			// get the response
			var offerResponse = message.response;

			// send the response
			rooms[roomID].players[receivingClient].sendUTF(JSON.stringify(offerResponse));

			console.log("Someone is responding to an offer in room " + roomID + " with response " + offerResponse);
		}

		/*
		if (message.type === 'utf8') {
		  // process WebSocket message
		}
		*/
	});

	connection.on('close', function(connection) {
		// close user connection
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