// TUTORIALS USED
// https://medium.com/@martin.sikora/node-js-websocket-simple-chat-tutorial-2def3a841b61
// https://www.tutorialspoint.com/webrtc/webrtc_signaling.htm

// HOW TO MAKE SERVER WEBSOCKET + SERVE STATIC FILES
// https://stackoverflow.com/questions/20919947/serve-websocket-and-http-server-at-same-address-on-node-js

// global GAME variable that we can access if we want
var GAME = null;

// global variable that holds our connection to the WebSocket (signaling) server
var connection;

// global variable that holds all our peers (will be set to its actual values, once players have created/joined a game)
var peers = [];

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
  connection = new WebSocket(host);

  var status = document.getElementById('status');

  // if browser doesn't support WebSocket, just show some notification and exit
  if (!window.WebSocket) {
    status.innerHTML = 'Sorry, but your browser doesn\'t support WebSocket.';
    return;
  }

  connection.onopen = function () {
    // connection is opened and ready to use
  };

  connection.onerror = function (error) {
    // an error occurred when sending/receiving data

    // just in case there were some problems with connection...
    status.innerHTML = 'Sorry, but there\'s some problem with your connection or the server is down.';
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
      // display the room code
      // document.getElementById('messageStream').innerHTML += 'Room Code:' + message.room

      // display confirmation
      status.innerHTML = 'Game created!';

      // save room code on connection
      connection.room = message.room

      // fire up Phaser!
      startPhaser(connection);
    }

    // if it's an OFFER ...
    if(message.type == 'offer') {
      // Create new peer (initiator = false)
      createPeer(false);

      var newPeer = peers[peers.length - 1];

      // extract the player that send the offer
      newPeer.curClientIndex = message.clientIndex;
      delete message.clientIndex;


      // put this signal into our peer (should be the last one we created)
      // (when it has formulated an answer, it will automatically send that back)
      newPeer.signal(message);
    }

    // if it's a RESPONSE to an offer
    if(message.type == 'answer') {
      // simply relay it to the peer
      // we should be a player, who only has a single peer active
      // (NOTE: if accepted, ALL communication henceforth should be peer-to-peer)
      peers[0].signal(message);
    }
  };

  // Listen for button for CREATING games
  document.getElementById("createGameBtn").addEventListener('click', function(ev) {
      // Disable button + default actions
      ev.preventDefault()
      ev.target.disabled = true;

      // remove createJoin overlay
      document.getElementById('overlay-createJoin').style.display = 'none';

      // give some feedback
      status.innerHTML = 'Creating room ...';

      var message = { "action": 'createRoom' }

      // Send a message to the websocket server, creating a game and opening ourselves to connections
      connection.send( JSON.stringify(message) );

      // TO DO: Go to a new screen
  });

  // Listen for button for JOINING games
  document.getElementById("joinGameBtn").addEventListener('click', function(ev) {
      // Disable button + default actions
      ev.preventDefault()
      ev.target.disabled = true;

      // remove createJoin overlay
      document.getElementById('overlay-createJoin').style.display = 'none';

      // give some feedback
      status.innerHTML = 'Connecting ... (this may take 5-10 seconds)';

      // Create peer (initiator = true)
      // NOTE: Once the peer is done and it can start pairing, it will inform the websocket server
      createPeer(true);
  });


  // Button for sending messages (chat-like functionality)
  document.getElementById('sendMessageBtn').addEventListener('click', function(ev) {
      // Disable button + default actions
      ev.preventDefault()

      // send content of text area
      var message = { 'type': 'msg', 'value': document.getElementById('messageContent').value }; 
      peers[0].send( JSON.stringify(message) );

      // clear text area
      document.getElementById('messageContent').value = '';
  });



  /*
   * This function initializes a (right type of) peer
   * Then attaches functions to it that deal with sending/receiving data
   * And finally gives itself back so the signaling server can use it
   */
  function createPeer(initiator) {
    // If we play on local LAN, we do NOT need iceServers (they'll just muck things up), so we can omit them in that case
    // Otherwise, this is a free STUN server (easy to obtain anywhere for free) and a free TURN server (how, I don't know, but it works)
    var peer = new SimplePeer({
      initiator: initiator,
      trickle: false,
      config: { iceServers: [{ urls: 'stun:stunserver.org:3478' }, { urls: "turn:numb.viagenie.ca:3478", credential:"HupseFlups2", username:"cyttildalionzo@gmail.com" }] },
    })

    // add peer to peers list
    peers.push(peer);

    // remember we're not connected yet
    peer.isConnected = false;
    
    peer.on('error', function(err) {
      console.log('error', err)
    })

    peer.on('signal', function(data) {
      console.log('SIGNAL', JSON.stringify(data))
      
      // if it's an OFFER, push it to the websocket (along with joinRoom credentials)
      if(data.type == 'offer') {
        var roomVal = document.getElementById('roomInput').value;
        var message = { "action": 'joinRoom', "room": roomVal, "offer": data }

        connection.send( JSON.stringify(message) );
      }

      // If it's an ANSWER, push it to the websocket
      if(data.type == 'answer') {
        var message = { "action": "offerResponse", "clientIndex": peer.curClientIndex, "response": data }

        connection.send( JSON.stringify(message) );
      }
    })

    peer.on('connect', function() {
      // remember we're connected
      peer.isConnected = true;

      console.log('CONNECT');

      // yay, we're connected!

      // if we were the initiator of a connection, we are a PLAYER
      if(initiator) {
        // TO DO: Go to lobby screen on phone

        // initialize our interface!
        startController();

        // show form for submitting messages
        document.getElementById("messageForm").style.display = 'block';

      // otherwise, we're the computer
      } else {
        // display confirmation
        status.innerHTML = 'You are connected!';

        // add player into the game
        GAME.scene.keys.sceneA.addPlayer(peer);
      }
    })

    peer.on('data', function(data) {
      // parse the message
      data = JSON.parse(data);

      if(data.type == 'msg') {
        // add message to the message stream
        document.getElementById('messageStream').innerHTML += "<p>" + data.value + "</p>";
      }

      if(peer.isConnected) {
        if(data.type == 'move') {
          // update player
          GAME.scene.keys.sceneA.updatePlayer(peer, data.vec);
        }
      }
    })
  }
}

// call the function that initializes the WebSockets + Peer-to-Peer stuff
initializeNetwork();

// STUFF (devlog) about scenes: https://phaser.io/phaser3/devlog/121
var SceneA = new Phaser.Class({

    Extends: Phaser.Scene,

    initialize:

    function SceneA ()
    {
        Phaser.Scene.call(this, { key: 'sceneA' });

        this.players = [];
    },

    preload: function() {
       this.load.crossOrigin = "Anonymous"; // to solve CORS bullshit
       this.canvas = this.sys.game.canvas;

       this.load.spritesheet('dude', 'assets/playerCharacter.png', { frameWidth: 64, frameHeight: 64 });
    },

    create: function() {
      // add room code at top right
      // NO, for now keep it simple, it's top left
      var roomText = this.add.text(10, 10, 'Room: ' + connection.room);
      var styleConfig = {
        fontFamily: '"Roboto Condensed"',
        align: 'right',
        color: '#000000'
      }

      roomText.setStyle(styleConfig);

      //
      // add boundaries at screen edge
      //
      var boundThickness = 20;
      this.boundBodies = this.physics.add.staticGroup();

      // add left, top, right, bottom walls
      this.boundBodies.create(0, 0.5*this.canvas.height, 'bounds').setSize(boundThickness, this.canvas.height);
      this.boundBodies.create(0.5*this.canvas.width, 0, 'bounds').setSize(this.canvas.width, boundThickness);
      this.boundBodies.create(this.canvas.width, 0.5*this.canvas.height, 'bounds').setSize(boundThickness, this.canvas.height);
      this.boundBodies.create(0.5*this.canvas.width, this.canvas.height, 'bounds').setSize(this.canvas.width, boundThickness);

      // 
      // create players physics group
      //
      this.playerBodies = this.physics.add.group();

      // make sure everything collides
      this.physics.add.collider(this.playerBodies); // players collide with each other
      this.physics.add.collider(this.boundBodies, this.playerBodies); // players collide with level bounds

      //
      // preload animations
      //
      this.anims.create({
            key: 'run',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 2 }),
            frameRate: 10,
            repeat: -1
        });
    },

    update: function(dt) {
      /* NOT NECESSARY IF WE USE PHYSICS

      // go through all players
      for(var i = 0; i < this.players.length; i++) {
        // update their position according to velocity
        // (which is set using input)
        var p = this.players[i];

        console.log("Moving player", p.vel.x, p.vel.y)

        p.x += p.vel.y;
        p.y += p.vel.x;
      }

      */
    },

    addPlayer: function(peer) {
      // grab random color
      // place square randomly on stage
      var color = new Phaser.Display.Color();
      color.random(50);

      var margin = 50
      var randX = Phaser.Math.Between(margin, this.canvas.width - margin), 
          randY = Phaser.Math.Between(margin, this.canvas.height - margin);

      // create new player (use graphics as base, turn into sprite within player group)
      var newPlayer = this.playerBodies.create(randX, randY, 'dude');

      // scale it up! => doesn't work, no idea why "this.body.updateFromGameObject()" is not a function
      //newPlayer.setScale(4).refreshBody();

      // tint it (for now, to distinguish players)
      newPlayer.tint = color.color;

      // just play the animation, always
      newPlayer.anims.play('run', true);

      // save player in array
      this.players.push(newPlayer);

      // save player index on peer
      peer.playerGameIndex = (this.players.length - 1);
    },

    updatePlayer: function(peer, vec) {
      // check if player even exists
      if(peer.playerGameIndex >= this.players.length) {
        console.log("No player with index " + peer.playerGameIndex);
        return;
      }

      var player = this.players[peer.playerGameIndex];
      var speed = 200;

      // just move the player according to velocity vector
      player.setVelocity(vec[0] * speed, vec[1] * speed);

      // flip properly (on the horizontal axis)
      if(vec[0] != 0) {
        player.displayWidth = Math.sign(vec[0]) * Math.abs(player.displayWidth);
      }
    },

});

function startPhaser() {
  // initialize Phaser game
  // URL (Arcade Physics world init): https://rexrainbow.github.io/phaser3-rex-notes/docs/site/arcade-world/#configuration
  var config = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    backgroundColor: '#8EB526',
    parent: 'phaser-game',
    scene: [SceneA],
    physics: {
        default: 'arcade',
        arcade: { }
    }
  }

  GAME = new Phaser.Game(config);
}


function startController() {

  function onTouchEvent(e) {
    // grab the right coordinates (distinguish between touches, mouse, etc.)
    var x,y;
    if(e.type == 'touchstart' || e.type == 'touchmove' || e.type == 'touchend' || e.type == 'touchcancel'){
       //NOPE: This would only be necessary (along with some other code) if we wanted the delta position of moving
       /* var touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
        x = touch.pageX;
        y = touch.pageY;*/

        x = e.touches[0].pageX;
        y = e.touches[0].pageY;

        // prevent default behaviour + bubbling from touch into mouse events
        e.preventDefault();
        e.stopPropagation();

    } else if (e.type == 'mousedown' || e.type == 'mouseup' || e.type == 'mousemove' || e.type == 'mouseover'|| e.type=='mouseout' || e.type=='mouseenter' || e.type=='mouseleave') {
        x = e.clientX;
        y = e.clientY;
    }

    // get center of screen
    var w  = document.documentElement.clientWidth, 
        h  = document.documentElement.clientHeight;
    var cX = 0.5*w, 
        cY = 0.5*h;

    // get vector between position and center, normalize it
    var length = Math.sqrt((x-cX)*(x-cX) + (y-cY)*(y-cY))
    var vector = [(x - cX)/length, (y - cY)/length];

    // if the interaction has ENDED, reset vector so player becomes static
    if(e.type == 'touchend' || e.type == 'touchcancel') {
      vector = [0,0]
    }

    // rotate movement arrow to match
    var angle = Math.atan2(vector[1], vector[0]) * 180 / Math.PI;
    if(angle < 0) { angle += 360; }
    document.getElementById('movementArrow').style.transform = 'rotate(' + angle + 'deg)';

    // send this vector across the network
    var message = { 'type': 'move', 'vec': vector }
    peers[0].send( JSON.stringify(message) );

    // debug log
    console.log("MY TOUCH POSITION IS: ", vector);
  }

  // add touch/mouse event listeners
  document.addEventListener('mousedown', onTouchEvent);
  document.addEventListener('mousemove', onTouchEvent);

  document.addEventListener('touchstart', onTouchEvent);
  document.addEventListener('touchmove', onTouchEvent);
  document.addEventListener('touchend', onTouchEvent);
  document.addEventListener('touchcancel', onTouchEvent);

  // insert movement image at the center
  document.body.innerHTML += '<img src="assets/movementArrow.png" id="movementArrow" />';

}