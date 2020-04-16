import { startPhaser } from './gameManager.js';
import { updateStatus } from './updateStatus.js';
import { createPeer } from './peerManager.js';

// TUTORIALS USED
// https://medium.com/@martin.sikora/node-js-websocket-simple-chat-tutorial-2def3a841b61
// https://www.tutorialspoint.com/webrtc/webrtc_signaling.htm

// HOW TO MAKE SERVER WEBSOCKET + SERVE STATIC FILES
// https://stackoverflow.com/questions/20919947/serve-websocket-and-http-server-at-same-address-on-node-js

// a global variable
// (bad, I know, but it's only ONE variable, and it's the most important one - the game itself)
window.GAME = null;

function initializeNetwork() {
  // if user is running mozilla then use it's built-in WebSocket
  window.WebSocket = window.WebSocket || window.MozWebSocket;

  // online uses random ports, local uses port 8888
  // also, Heroku uses https by default, so use wss:// (secure websocket), otherwise we get warnings and errors about security
  // see this: https://stackoverflow.com/questions/11768221/firefox-websocket-security-issue

  //var connection = new WebSocket('ws://127.0.0.1:42950');
  var host = location.host || '127.0.0.1:8888'
  if(location.host.length <= 0 || host == "127.0.0.1:8888") { 
    host = 'ws://' + host;
  } else {
    host = 'wss://' + host;
  }

  // this creates the connection and keeps a reference to it
  var connection = new WebSocket(host);

  // whenever we start a new peer, this value is overwritten
  // for players, this means it always holds the correct peer
  // for computers, it is often wrong, but we don't need that anyway :p
  var curPeer = null;

  // if browser doesn't support WebSocket, just show some notification and exit
  if (!window.WebSocket) {
    updateStatus('Sorry, but your browser doesn\'t support WebSocket.');
    return;
  }

  connection.onopen = function () {
    // connection is opened and ready to use
  };

  connection.onerror = function (error) {
    // an error occurred when sending/receiving data, display error message
    updateStatus('Sorry, but there\'s some problem with your connection or the server is down.');
  };

  connection.onmessage = function (message) {
    // check if message is proper JSON
    try {
      var json = JSON.parse(message.data);
    } catch (e) {
      console.log('This doesn\'t look like a valid JSON: ', message.data);
      return;
    }
    
    // parse message
    message = JSON.parse(message.data);

    // if it's a confirmation of the created game (room) ...
    if(message.type == 'confirmRoom') {
      // display confirmation
      updateStatus('Game created! Now loading the game ...');

      // save room code on connection
      connection.room = message.room

      // fire up Phaser!
      startPhaser(connection);
    }

    // if it's an ERROR somewhere in the process
    if(message.type == 'error') {
      // differentiate error message based on the type of error
      if(message.val == 'wrong room') {
        updateStatus('Sorry, that room does not exist. Reload and try again.');
      } else if(message.val == 'no player') {
        updateStatus('Tried to reconnect, but that player doesn\'t exist ...');
      } else {
        updateStatus('Error: something went wrong, but we don\'t know what ... perhaps try again?');
      }
    }

    // if it's an OFFER ...
    if(message.type == 'offer') {
      // Create new peer (initiator = false)
      curPeer = createPeer(false, connection, message);

      // delete some info from the message (to save bandwidth)
      delete message.clientUsername;

      // put this signal into our peer (should be the last one we created)
      // (when it has formulated an answer, it will automatically send that back)
      curPeer.signal(message);
    }

    // if it's a RESPONSE to an offer
    if(message.type == 'answer') {
      // simply relay it to the peer
      // we should be a player, who only has a single peer active
      // (NOTE: if accepted, ALL communication henceforth should be peer-to-peer)
      curPeer.signal(message);
    }
  };

  // Listen to button for CREATING games
  document.getElementById("createGameBtn").addEventListener('click', function(ev) {
      // Disable button + default actions
      ev.preventDefault()
      ev.target.disabled = true;

      // remove createJoin overlay
      document.getElementById('overlay-createJoin').style.display = 'none';

      // give some feedback
      updateStatus('Creating room ...');

      // Send a message to the websocket server, creating a game and opening ourselves to connections
      var msg = { "action": 'createRoom' } 
      connection.send( JSON.stringify(msg) );
  });

  // Listen to button for JOINING games
  document.getElementById("joinGameBtn").addEventListener('click', function(ev) {
      //
      // some error checks (username, room code, valid messages, etc.)
      //
      var roomVal = document.getElementById('roomInput').value;
      var usn = document.getElementById('usernameInput').value;

      if(roomVal.length != 4) {
        updateStatus('Incorrect room code!');
        return
      }

      if(usn.length <= 2) {
        updateStatus('Username too short!');
        return;
      }

      if(usn.length >= 20) {
        updateStatus('Username too long!');
        return;
      }

      // Disable button + default actions
      ev.preventDefault()
      ev.target.disabled = true;

      // remove createJoin overlay
      document.getElementById('overlay-createJoin').style.display = 'none';

      // give some feedback
      updateStatus('Connecting ... (this may take 5&ndash;10 seconds)');

      // Create peer (initiator = true)
      // NOTE: Once the peer is done and it can start pairing, it will inform the websocket server
      curPeer = createPeer(true, connection);
  });
}

// call the function that initializes the whole game + interface 
initializeNetwork();