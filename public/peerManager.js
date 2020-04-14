import { updateStatus } from './updateStatus.js';
import { startController } from './controllerManager.js';
import { peerAlways } from './peerAlways.js';
import { peerController } from './peerController.js';
import { peerComputer } from './peerComputer.js';

/*
 * This function initializes the (right type of) peer
 * Then attaches functions to it that deal with sending/receiving data
 * And finally gives itself back so the signaling server can use it
 */
export function createPeer(initiator, connection, connectionData = null) {
  // If we play on local LAN, we do NOT need iceServers (they'll just muck things up), so we can omit them in that case
  // Otherwise, this is a free STUN server (easy to obtain anywhere for free) and a free TURN server (how, I don't know, but it works)
  var peer = new SimplePeer({
    initiator: initiator,
    trickle: false,
    config: { iceServers: [{ urls: 'stun:stunserver.org:3478' }, { urls: "turn:numb.viagenie.ca:3478", credential:"12345678", username:"askthepanda@pandaqi.com" }] },
  })

  // remember some properties (we're not connected yet, nor disconnected, nor on gameOver)
  peer.isConnected = false;
  peer.hasDisconnected = false;
  peer.gameOver = false;

  // if we've received a matching username, copy it to the peer
  if(connectionData != null) {
    peer.curClientUsername = connectionData.clientUsername;
  }
  
  // this error handling is mostly for the "ICE server/connection failed" error
  // it happens sometimes, and I cannot figure out why, but it's probably just because of some oddities in my network (or temporary problems at the STUN/TURN servers)
  // however, I do not know how to catch that specific event: https://stackoverflow.com/questions/47086373/simple-peer-webrtc-error-ice-connection-failed
  // so I just display a general error message on every type of error with possible fixes
  peer.on('error', function(err) {
    console.log('error', err);
    updateStatus('<p>Error! Something went wrong with the connection.</p><p>Possible fixes: simply restart and retry, make sure everyone is on the same Wi-Fi network, open the game in an Incognito window, or check if your browser supports WebRTC.</p>')
  })

  peer.on('close', function() {
    console.log("Peer closed");

    // if we are the computer, we must remember this peer has disconnected (so we can reconnect it later)
    if(!initiator) {
      peer.hasDisconnected = true;

      // inform players on screen
      updateStatus('<p>Oh no, player ' + peer.curClientUsername + ' disconnected!</p><p>To reconnect, simply go to the website and log in with the exact same username.</p>');

      // pause the game
      var gm = GAME.scene.keys.mainGame;
      gm.backgroundMusic.pause();
      gm.scene.pause();
    }
  })

  peer.on('signal', function(data) {
    // if it's an OFFER, push it to the websocket (along with joinRoom credentials)
    if(data.type == 'offer') {
      var roomVal = document.getElementById('roomInput').value.toUpperCase();
      var usn = document.getElementById('usernameInput').value.toUpperCase();
      var message = { "action": 'joinRoom', "room": roomVal, "username": usn,"offer": data }

      connection.send( JSON.stringify(message) );
    }

    // If it's an ANSWER, push it to the websocket
    if(data.type == 'answer') {
      var message = { "action": "offerResponse", "clientUsername": peer.curClientUsername, "response": data }

      connection.send( JSON.stringify(message) );
    }
  })

  peer.on('connect', function() {
    // remember we're connected
    peer.isConnected = true;

    // if we were the initiator of a connection, we are a PLAYER
    if(initiator) {
      // initialize our interface!
      startController(peer);

    // otherwise, we're the computer
    } else {
      // display confirmation
      updateStatus('You are connected!');

      // add player into the game
      GAME.scene.keys.mainGame.addPlayer(peer);
    }
  })

  peer.on('data', function(data) {
    // parse the message
    data = JSON.parse(data);

    // 
    // check if this signal is an "always" signal
    // What's that? A signal that should always pass through (or cannot be relied upon to be on peer.isConnected)
    //
    peerAlways(peer, connection, data);

    // if we're not connected, or we're in a game over ("pause") state
    // ignore the signal altogether
    if(!peer.isConnected || peer.gameOver) {
      return;
    }

    //
    // Now we feed the signal through to the right module
    //

    // if this is the controller ( = smartphone), feed the signal into the peerController module
    if(initiator) {
      peerController(peer, connection, data);
    
    // if this is the computer, feed the signal into the peerComputer module
    } else {
      peerComputer(peer, connection, data);
    }
  })

  return peer;
}