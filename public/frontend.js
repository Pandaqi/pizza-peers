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

// global variable to make debugging on computer easier
var mouseDown = false;

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
      newPeer.curClientUsername = message.clientUsername;
      delete message.clientUsername;


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
      //
      // some error checks (username, room code, valid messages, etc.)
      //
      var roomVal = document.getElementById('roomInput').value;
      var usn = document.getElementById('usernameInput').value;

      if(roomVal.length != 4) {
        status.innerHTML = 'Incorrect room code!';
        return
      }

      if(usn.length <= 2) {
        status.innerHTML = 'Username too short!';
        return;
      }

      if(usn.length >= 20) {
        status.innerHTML = 'Username too long!';
        return;
      }

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

      // yay, we're connected!
      console.log('PLAYER CONNECTED');

      
      // if we were the initiator of a connection, we are a PLAYER
      if(initiator) {
        // initialize our interface!
        startController();

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

      // grab reference to game scene
      var gm = null;
      if(GAME != null) {
        gm = GAME.scene.keys.sceneA;
      }

      if(data.type == 'msg') {
        // add message to the message stream
        document.getElementById('messageStream').innerHTML += "<p>" + data.value + "</p>";
      }

      // the first mobile phone to connect, receives this lobby event
      // it creates a button that, once clicked, actually starts the game
      if(data.type == 'lobby') {
        var dynInt = document.getElementById('dynamicInterface');

        // remember we're vip
        peer.isVIP = true;

        // create button to start the game
        var button = document.createElement("button");
        button.classList.add('buyButton');
        button.innerHTML = "<span>Start the game! (Press this once everyone's connected)</span>";
        dynInt.appendChild(button);

        button.addEventListener ("click", function() {
          // remove button again
          dynInt.innerHTML = '';

          // send message to start the game
          var msg = { 'type': 'start-game' }
          peer.send( JSON.stringify(msg) );
        });
      }

      if(data.type == 'start-game') {
        gm.startGame();
      }

      if(data.type == 'restart-game') {
        gm.restartGame();
      }

      if(data.type == 'game-end') {
        var dynInt = document.getElementById('dynamicInterface');
        dynInt.innerHTML = 'GAME OVER! ';

        // if we are the vip, get the button to restart
        if(peer.isVIP) {
          var button = document.createElement("button");
          button.classList.add('buyButton');
          button.innerHTML = "<span>Play again?</span>";
          dynInt.appendChild(button);

          button.addEventListener ("click", function() {
            // remove button again
            dynInt.innerHTML = '';

            // send message to start the game
            var msg = { 'type': 'restart-game' }
            peer.send( JSON.stringify(msg) );
          });
        }

        // TO DO: Also give a button to "destroy" the game, makes it easy to remove from the server as well
        // (Alternatively, when you close the computer screen, automatically send one final signal to the server that it should remove the game)
      }

      if(peer.isConnected) {
        var dynInt = document.getElementById('dynamicInterface');

        // player has received its ALLERGIES
        if(data.type == 'allergies') {
          var allergyDiv = document.getElementById('allergyInterface');

          var tempString = '<div class="allergyDiv"><span>You are allergic to</span>'
          var numAllergies = data.val.length;
          for(var i = 0; i < numAllergies; i++) {
            var ingredientIndex = Math.pow(2, data.val[i]); // convert ingredient index (0-4) to position in spritesheet
            tempString += "<div class='ingSprite' style='background-position:-" + (ingredientIndex*32) + "px 0;'></div>";

            // if this is the second to last iteration, add the word "and"
            if(i == (numAllergies - 2)) {
              tempString += "<span>and</span>"
            } else {
              tempString += "<span>, </span>"
            }
          }
          tempString += '</div>'

          // finally, set the div to the string we just
          allergyDiv.innerHTML = tempString;
        }

        // player has requested a MOVE
        if(data.type == 'move') {
          gm.updatePlayer(peer, data.vec);
        }

        // player has requested to BUY an ingredient
        if(data.type == 'buy') {
          gm.buyAction(peer);
        }

        // player is at an INGREDIENT location (for the first time; overlapEnter)
        if(data.type == 'ing') {
          var ingredients = ['Dough', 'Tomatoes', 'Cheese', 'Spice', 'Vegetables']

          dynInt.innerHTML = '<p>You are at an ingredient store.</p>';

          // create the button
          var button = document.createElement("button");
          button.classList.add('buyButton');
          button.innerHTML = "<span>Buy</span><div class='ingSprite' style='background-position:-" + (data.ing*32) + "px 0;'></div><span>for " + data.price + "</span><div class='ingMoney'></div>";

          // append to dynamic interface
          dynInt.appendChild(button);

          // add event handler
          // when we click this button ...
          button.addEventListener ("click", function() {
            // we buy the ingredient for that price!
            // (the computer should remember the offer it made)
            var msg = { 'type':'buy' }
            peer.send( JSON.stringify(msg) );
          });
        }

        // player has moved away from an INGREDIENT location (overlapExit)
        if(data.type == 'ing-end') {
          dynInt.innerHTML = '';
        }

        // player is at a TABLE location
        if(data.type == 'table') {
          dynInt.innerHTML = '<p>You are at a table.</p>';

          // content of the table
          var tableContent = data.content;

          // contents of your backpack
          var backpackContent = data.backpack;

          // display our options with nice buttons

          if(tableContent >= 0) {
            // PICK UP current content
            var btn1 = document.createElement("button");
            btn1.classList.add('buyButton');
            btn1.innerHTML = "<span>Pick up</span><div class='ingSprite' style='background-position:-" + (tableContent*32) + "px 0;'></div><span>from the table</span>";
            dynInt.appendChild(btn1);
            btn1.addEventListener ("click", function() {
              // ask computer to pick up this ingredient
              var msg = { 'type': 'table-pickup' }
              peer.send( JSON.stringify(msg) );

              dynInt.innerHTML = '';
            });
          }

          // DROP something from current backpack
          for(var i = 0; i < backpackContent.length; i++) {
            // it's very important we copy the current ingredient here
            // otherwise, at the time the listener below is executed, it would pick the last known value of "i" instead (which would be 5)
            var curIng = backpackContent[i];

            var btn = document.createElement("button");
            btn.classList.add('buyButton');
            btn.setAttribute('data-ing', curIng);
            btn.innerHTML = "<span>Drop</span><div class='ingSprite' style='background-position:-" + (curIng*32) + "px 0;'></div><span>on the table</span>";
            dynInt.appendChild(btn);
            
            // tell computer to drop this ingredient
            btn.addEventListener("click", function(ev) {
              // IMPORTANT: use ev.currentTarget to get the thing that has the eventListener, ev.target is the thing that was actually clicked
              var ingredient = parseInt( ev.currentTarget.getAttribute('data-ing') );
              var msg = { 'type': 'table-drop', 'ing': ingredient };
              peer.send( JSON.stringify(msg) );

              dynInt.innerHTML = '';
            });
          } 
        }

        // pick up ingredient from table
        if(data.type == 'table-pickup') {
          gm.pickupIngredient(peer);
        }

        // drop (given) ingredient on table
        if(data.type == 'table-drop') {
          gm.dropIngredient(peer, data.ing);
        }

        // stop standing near table
        if(data.type == 'table-end') {
          dynInt.innerHTML = '';
        }

        // player is at an ORDER area
        if(data.type == 'area') {
          dynInt.innerhtml = 'You rang the doorbell.';

          // if they are ordering, create a button for that
          if(data.status == 'ordering') {
            var btn = document.createElement("button");
            btn.classList.add('buyButton');
            btn.innerHTML = "<span>Take their order!</span>";
            dynInt.appendChild(btn);
            
            // tell computer to take the order
            btn.addEventListener ("click", function() {
              var msg = { 'type': 'take-order' };
              peer.send( JSON.stringify(msg) );

              dynInt.innerHTML = '';
            });

          // if they are waiting on their pizza, create a button to give them their pizza!
          } else if(data.status == 'waiting') {
            var btn = document.createElement("button");
            btn.classList.add('buyButton');
            btn.innerHTML = "<span>Deliver the pizza!</span>";
            dynInt.appendChild(btn);
            
            // tell computer to deliver the order
            btn.addEventListener ("click", function() {
              var msg = { 'type': 'deliver-order' };
              peer.send( JSON.stringify(msg) );

              dynInt.innerHTML = '';
            });
          }
        }

        // player is at an order area, and has chosen to TAKE the order
        // (this message is always received on the COMPUTER side)
        if(data.type == 'take-order') {
          gm.takeOrder(peer);
        }

        // player decided to deliver an order
        if(data.type == 'deliver-order') {
          gm.deliverOrder(peer);
        }

        // player LEFT an order area
        if(data.type == 'area-end') {
          dynInt.innerHTML = '';
        }
      }
    })
  }

  function mouseUp(ev) {
    mouseDown = false; 
    var msg = { 'type': 'move', 'vec': [0,0] };
    peers[0].send( JSON.stringify(msg) );
  }

  function startController() {
    // remove/hide status container
    document.getElementById('status-container').style.display = 'none';

    // remove message stream
    document.getElementById('messageStream').style.display = 'none';

    // show form for submitting messages
    // NOTE/TO DO: Turned off for now, don't see the use in this game (but might want it in a later game)
    // document.getElementById("messageForm").style.display = 'block';

    // add touch/mouse event listeners
    var gameDiv = document.getElementById('phaser-game');
    
    gameDiv.addEventListener('mousedown', function(ev) { mouseDown = true; });
    gameDiv.addEventListener('mousemove', onTouchEvent);
    gameDiv.addEventListener('mouseup', mouseUp);
    gameDiv.addEventListener('mouseout', mouseUp);
    gameDiv.addEventListener('mouseleave', mouseUp);

    gameDiv.addEventListener('touchstart', onTouchEvent);
    gameDiv.addEventListener('touchmove', onTouchEvent);
    gameDiv.addEventListener('touchend', onTouchEvent);
    gameDiv.addEventListener('touchcancel', onTouchEvent);

    // insert movement image at the center
    // (it rotates to show how you're currently moving)
    document.getElementById('movementArrow').style.display = 'block';
  }

  function onTouchEvent(e) {
    // grab the right coordinates (distinguish between touches, mouse, etc.)
    var x = 0,
        y = 0;

    if(e.type == 'touchstart' || e.type == 'touchmove' || e.type == 'touchend' || e.type == 'touchcancel'){
       //NOPE: This would only be necessary (along with some other code) if we wanted the delta position of moving
       /* var touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
        x = touch.pageX;
        y = touch.pageY;*/

        // these coordinates are not available when touch ends
        // because, well, there's no touch anymore
        if(e.type == 'touchstart' || e.type == 'touchmove') {
          x = e.touches[0].pageX;
          y = e.touches[0].pageY;
        }


        // prevent default behaviour + bubbling from touch into mouse events
        e.preventDefault();
        e.stopPropagation();

    } else if (e.type == 'mousedown' || e.type == 'mouseup' || e.type == 'mousemove' || e.type == 'mouseover' || e.type=='mouseout' || e.type=='mouseenter' || e.type=='mouseleave') {
        
      if(e.type == 'mousemove') {
        x = e.clientX;
        y = e.clientY;
      }
    }

    // do NOT register mouse moves as input, unless we're holding the mouse button down
    if(e.type == 'mousemove' && !mouseDown) {
      return;
    }

    // if the interaction has ENDED, reset vector so player becomes static
    // don't do anything else
    if((e.type == 'touchend' || e.type == 'touchcancel' || e.type == 'mouseout' || e.type == 'mouseleave' || e.type == 'mouseup')) {
      console.log("TOUCH ENDDDD");
      var msg = { 'type': 'move', 'vec': [0,0] };
      peers[0].send( JSON.stringify(msg) );

      return false;
    }

    // get center of screen
    var w  = document.documentElement.clientWidth, 
        h  = document.documentElement.clientHeight;
    var cX = 0.5*w, 
        cY = 0.5*h;

    // get vector between position and center, normalize it
    var length = Math.sqrt((x-cX)*(x-cX) + (y-cY)*(y-cY))
    var vector = [(x - cX)/length, (y - cY)/length];

    // rotate movement arrow to match
    var angle = Math.atan2(vector[1], vector[0]) * 180 / Math.PI;
    if(angle < 0) { angle += 360; }
    document.getElementById('movementArrow').style.transform = 'rotate(' + angle + 'deg)';

    // send this vector across the network
    var message = { 'type': 'move', 'vec': vector }
    peers[0].send( JSON.stringify(message) );

    return false;
  }
}

// call the function that initializes the WebSockets + Peer-to-Peer stuff
initializeNetwork();

// STUFF (devlog) about scenes: https://phaser.io/phaser3/devlog/121
var SceneA = new Phaser.Class({

    Extends: Phaser.Scene,

    initialize:

    function SceneA()
    {
        Phaser.Scene.call(this, { key: 'sceneA' });

        this.players = [];
    },

    preload: function() {
       this.load.crossOrigin = "Anonymous"; // to solve CORS bullshit
       this.canvas = this.sys.game.canvas;

       // images
       this.load.image('money', 'assets/moneyIcon.png');
       this.load.spritesheet('moneyAnim', 'assets/moneyAnim.png', { frameWidth: 8, frameHeight: 8 });

       // spritesheets
       this.load.spritesheet('dude', 'assets/playerCharacter.png', { frameWidth: 11, frameHeight: 16 });
       this.load.spritesheet('ingredients', 'assets/ingredientIcons.png', { frameWidth: 8, frameHeight: 8 });
       this.load.spritesheet('staticAssets', 'assets/table.png', { frameWidth: 8, frameHeight: 8 });
       this.load.spritesheet('buildings', 'assets/buildings.png', { frameWidth: 8, frameHeight: 11 });

       this.load.spritesheet('orderMark', 'assets/orderMark.png', { frameWidth: 8, frameHeight: 12 });
       this.load.spritesheet('hourglass', 'assets/hourglass.png', { frameWidth: 16, frameHeight: 16});

    },

    create: function() {
      // add room code at bottom right
      var roomText = this.add.text(this.canvas.width - 10, this.canvas.height - 10, connection.room);
      var styleConfig = {
        fontFamily: '"VT323"',
        align: 'right',
        color: 'rgba(0,0,0,0.4)',
        fontSize: 32
      }

      roomText.setStyle(styleConfig);
      roomText.setOrigin(1, 1);

      //
      // Add "strikes" (5 strikes fails the level) at the top right
      // These keep track of the number of failed orders; fill them all
      //
      this.maxAllowedFails = 5;
      this.strikeSprites = [];
      this.numFailedOrders = 0;
      var margin = 10;
      for(var i = 0; i < this.maxAllowedFails; i++) {
        var newSprite = this.add.sprite(this.canvas.width - this.maxAllowedFails*(32 + margin) + i*(32 + margin), margin, 'staticAssets');
        newSprite.setFrame(8);
        newSprite.setOrigin(1, 0);
        newSprite.setScale(4,4);
        newSprite.depth  = this.canvas.height*2;

        this.strikeSprites.push(newSprite);
      }

      //
      // add boundaries at screen edge
      // (add left, top, right, bottom walls)
      //
      var boundThickness = 20;
      this.boundBodies = this.physics.add.staticGroup();

      var bounds = [
        [-0.5*boundThickness, 0.5*this.canvas.height,                    boundThickness, this.canvas.height],
        [0.5*this.canvas.width, -0.5*boundThickness,                     this.canvas.width, boundThickness ],
        [this.canvas.width + 0.5*boundThickness, 0.5*this.canvas.height, boundThickness, this.canvas.height],
        [0.5*this.canvas.width, this.canvas.height + 0.5*boundThickness, this.canvas.width, boundThickness]
      ]

      for(var i = 0; i < 4; i++) {
        var bb = this.boundBodies.create(bounds[i][0], bounds[i][1], 'bounds');

        bb.displayWidth = bounds[i][2];
        bb.displayHeight = bounds[i][3];

        bb.setSize(bounds[i][2], bounds[i][3]).refreshBody();
      }

      // 
      // create players physics group
      //
      this.playerBodies = this.physics.add.group();
      this.playerBodiesActual = this.physics.add.group();

      // make sure everything collides
      this.physics.add.collider(this.playerBodiesActual); // players collide with each other
      this.physics.add.collider(this.boundBodies, this.playerBodiesActual); // players collide with level bounds

      //
      // preload animations
      //
      // TO DO: Create proper idle animation (now it's just static)
      this.anims.create({
        key: 'idle',
        frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 0 }),
        frameRate: 10,
        repeat: -1
      })

      this.anims.create({
            key: 'run',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 2 }),
            frameRate: 10,
            repeat: -1
        });

      this.anims.create({
            key: 'orderJump',
            frames: this.anims.generateFrameNumbers('orderMark', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1
        });

      this.anims.create({
            key: 'moneyRotate',
            frames: this.anims.generateFrameNumbers('moneyAnim', { start: 0, end: 5 }),
            frameRate: 10,
            repeat: -1
        });

      this.anims.create({
            key: 'hourglass',
            frames: this.anims.generateFrameNumbers('hourglass', { start: 0, end: 9 }),
            frameRate: 10,
            repeat: -1
        });

      // 
      // initialize texture that will hold all shadows
      //
      this.shadowGraphics = this.add.graphics();
      this.shadowGraphics.depth = 0;
      this.shadowGraphics.alpha = 0.2;

      // URL: find the right mode to use! (https://photonstorm.github.io/phaser3-docs/Phaser.BlendModes.html)
      this.shadowGraphics.blendMode = Phaser.BlendModes.DARKEN;
      this.shadowGraphics.fillStyle(0x000000, 1.0);

      //
      // generate random city
      //
      this.tileWidth = 32;
      this.tileHeight = 32;
      this.gameWidth = this.canvas.width;
      this.gameHeight = this.canvas.height;

      this.mapWidth = Math.floor(this.gameWidth / this.tileWidth);
      this.mapHeight = Math.floor(this.gameHeight / this.tileHeight);

      // 0) Create random map (2D grid) that fills the screen
      this.map = [];
      for(var x = 0; x < this.mapWidth; x++) {
        this.map[x] = [];
        for(var y = 0; y < this.mapHeight; y++) {
          var value = 0;

          // create a BORDER around the map
          // this prevents awkward placement of tables, ingredient locations, etc.
          if(x == 0 || x == (this.mapWidth - 1)) {
            value = -1;
          } else if(y == 0 || y == (this.mapHeight - 1)) {
            value = -1;
          }

          this.map[x][y] = value;
        }
      }

      this.runningID = 0;

      //
      // 1) Create random workspace(s)
      // => the function "createWorkspace" already finds a random location that's far away from existing workspaces
      //
      var numWorkspaces = 3;
      this.existingWorkspaces = [];

      this.wallBodies = this.physics.add.staticGroup();
      this.wallBodiesActual = this.physics.add.staticGroup();

      this.tableBodies = this.physics.add.staticGroup();
      this.tableBodiesActual = this.physics.add.staticGroup();

      for(var i = 0; i < numWorkspaces; i++) {
        this.createWorkspace();
      }

      // overlap players and walls (for see through)
      this.physics.add.overlap(this.playerBodies, this.wallBodies, this.playerBehindBuilding, null, this);

      // collide players and walls (because, well, you can't walk through walls)
      this.physics.add.collider(this.playerBodiesActual, this.wallBodiesActual);

      // overlap players and tables (for see through)
      // NOTE: Turned this off, for it isn't really necessary and it looks ugly
      //this.physics.add.overlap(this.playerBodies, this.tableBodies, this.playerBehindBuilding, null, this);

      // make player and tables collide
      this.physics.add.collider(this.playerBodiesActual, this.tableBodiesActual, this.playerAtTable, null, this);
      

      //
      // 2) Add ingredient locations at random
      //
      var baseIngredients = [1,2,4,8,16];
      var numIngLoc = 8;

      // shuffle ingredients (for random distribution)
      baseIngredients = this.shuffle(baseIngredients);

      // already initialize building groups (for ingredient locations are also buildings)
      this.buildingBodies = this.physics.add.staticGroup();
      this.buildingBodiesActual = this.physics.add.staticGroup();

      // go through all ingredient locations
      var tempIngLocs = [];
      this.ingredientBodies = this.physics.add.staticGroup();
      for(var i = 0; i < numIngLoc; i++) {
        // keep looking for new locations until we find an empty spot
        var x,y
        do {
          x = Math.floor(Math.random() * this.mapWidth);
          y = Math.floor(Math.random() * this.mapHeight);
        } while( !this.mapCheck(x, y, 10, tempIngLocs) );

        // 1 MEANS ingredients
        this.map[x][y] = 1;

        // remember this thing, so we can avoid placing stuff next to it in the world generation!
        tempIngLocs.push({ 'x': x, 'y': y });

        // then create the body with the right size, type, price, etc.
        var ing = this.ingredientBodies.create(x * this.tileWidth, y * this.tileHeight, 'ingredients');

        ing.displayWidth = ing.displayHeight = this.tileWidth*0.8;
        ing.setSize(this.tileWidth, this.tileWidth).refreshBody();
        ing.id = this.runningID++;

        // set some properties => ingredient type and price
        // (modulo wrap the baseIngredients array to get a few duplicates around the map)
        ing.myNum = baseIngredients[i % (baseIngredients.length)];
        ing.price = Math.floor(Math.random() * 5) + 1;

        // do NOT use .frame as a property!
        ing.setFrame(ing.myNum);
        ing.alpha = 0.75;

        // create single road piece next to it
        // (this algorithm creates a road, tries to connect it to an existing road => if it fails, it extends the road as far as it can go (probably the edge of the screen)
        var result = this.extendRoad(x,y);

        // move ingredient body to the road (again, invert the extendRoad direction)
        // (will soon be replaced by an actual building at that location)
        ing.x -= result[0] * this.tileWidth;
        ing.y -= result[1] * this.tileHeight;
        ing.depth = -0.5;
        ing.refreshBody();

        // figure out rotation and type by myself
        var rotation = this.convertVectorToRotation(result);
        var type = Math.log2(ing.myNum);

        // create building
        var b = this.createBuilding(x, y, rotation, type);
        b.myStatus = 'disabled';

        // add rotating money/market sign
        // also make it go up and down
        var money = this.add.sprite(b.x, b.y - 1.5*b.displayHeight, 'moneyAnim');
        money.anims.play('moneyRotate');
        money.setScale(4,4);
        money.depth = b.depth;

        var tween = this.tweens.add({
            targets: money,
            y: { from: money.y, to: money.y - 8 },
            ease: 'Linear',       // 'Cubic', 'Elastic', 'Bounce', 'Back'
            duration: 500,
            repeat: -1,
            yoyo: true
        });
      }
      
      // finally, check for overlap between players and ingredients
      this.physics.add.overlap(this.playerBodies, this.ingredientBodies, this.playerAtIngredient, null, this);

      //
      // 4) Place some buildings around the map
      //
      var numBuildings = 30;
      this.orderAreas = this.physics.add.staticGroup();
      for(var i = 0; i < numBuildings; i++) {
        // search for a free (x,y) spot
        var x,y
        do {
          x = Math.floor(Math.random() * this.mapWidth);
          y = Math.floor(Math.random() * this.mapHeight);
        } while( this.map[x][y] != 0);

        // now check if there's a road next to us somewhere
        // if so, set building to the corresponding rotation, place building there, do nothing more!
        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        var hasRoad = false;
        var rotation = -1;
        var freeSpot = -1;

        // evaluate directions in a random order
        // again, do this REVERSED
        dirs = this.shuffle(dirs);

        for(var d = 0; d < 4; d++) {
          var adjVal = this.map[(x - dirs[d][0])][(y - dirs[d][1])];

          // a free spot we find must be saved!
          if(adjVal == 0) {
            freeSpot = d;

          // if there's a road here, we already have a connection, stop doing anything
          } else if(adjVal == 3) {
            hasRoad = true;
            freeSpot = d;
            break;
          }
        }

        // if there is no free spot, try again later
        if(freeSpot < 0) {
          i--;
          continue;
        }

        // rotate towards the free spot we found
        rotation = freeSpot;

        // convert index to rotation
        // NOTE: Do this BEFORE we use extendRoad, as that modifies the array (dirs), and arrays are passed by reference.
        // NOTE 2: Remember we must REVERSE this to face the road
        var ind = dirs[rotation];
        var rotation = this.convertVectorToRotation(ind);


        // if it still doesn't have a road ...
        if(!hasRoad) {
          // extend the road (using our customly found direction and rotation)
          this.extendRoad(x, y, dirs, freeSpot);
        }

        // 4 MEANS building
        this.map[x][y] = 4;

        // Type (4th parameter) is 5, because this is a default building, and the 5 ingredients (0-4) come before it
        var building = this.createBuilding(x, y, rotation, 5);

        // now create a body in front of it that will be used for taking/delivering orders
        var orderArea = this.orderAreas.create((x - ind[0]) * this.tileWidth, (y - ind[1]) * this.tileHeight, 'staticAssets');
        orderArea.setFrame(2);
        orderArea.alpha = 0.75;
        orderArea.setVisible(false);
        orderArea.enable = false;

        orderArea.setScale(3.2, 3.2).refreshBody();

        orderArea.myBuilding = building;
        orderArea.depth = -0.5;

        // connect building with its area
        building.myArea = orderArea;

        // add order mark (sufficiently above the building, so it looks good and clearly visible)
        var orderMark = this.add.sprite(building.x, building.y - this.tileHeight*2.25, 'orderMark');
        orderMark.setVisible(false);
        orderMark.depth = building.depth;
        building.myOrderMark = orderMark;

        orderMark.setScale(4,4);

        // add order sprite
        var orderSprite = this.add.sprite(building.x, building.y - this.tileHeight*2.25, 'ingredients');
        orderSprite.setVisible(false);
        orderSprite.setScale(4,4);
        orderSprite.depth = building.depth;

        building.myOrderSprite = orderSprite;
        building.myOrderID = 0;

        // add hourglass
        var hourGlass = this.add.sprite(orderMark.x + 0.5*orderMark.displayWidth, orderMark.y, 'hourglass');
        hourGlass.setVisible(false);
        hourGlass.depth = orderMark.depth;
        hourGlass.setScale(2,2);
        building.myHourglass = hourGlass;
      }

      // make ACTUAL buildings and players collide
      this.physics.add.collider(this.playerBodiesActual, this.buildingBodiesActual);
      
      // otherwise, make buildings and players overlap (to make them transparent if the player is behind them)
      this.physics.add.overlap(this.playerBodies, this.buildingBodies, this.playerBehindBuilding, null, this);

      // make players and orderAreas overlap
      this.physics.add.overlap(this.playerBodies, this.orderAreas, this.playerAtArea, null, this);

      //
      // 5) Place some nature/decoration/trees around the world
      //
      this.natureBodies = this.physics.add.staticGroup();
      this.natureBodiesActual = this.physics.add.staticGroup();
      var numNature = 30;
      for(var i = 0; i < numNature; i++) {
        // search for a free (x,y) spot
        var x,y
        do {
          x = Math.floor(Math.random() * this.mapWidth);
          y = Math.floor(Math.random() * this.mapHeight);
        } while( this.map[x][y] != 0);

        // 6 MEANS nature
        this.map[x][y] = 6;

        var nature = this.natureBodies.create(x * this.tileWidth, y * this.tileWidth, 'buildings')

        var frames = [24,25,26,27]; // array with all nature frames; should update this manually
        var bodies = [true, true, true, false] // also update manually
        var randFrameIndex = Math.floor(Math.random() * frames.length);
        nature.setFrame( frames[randFrameIndex] );

        nature.setOrigin(0.5, 1);
        nature.y += 32*0.5;

        // offset nature randomly within its cell
        nature.y -= Math.random()*0.5*nature.displayHeight;
        nature.x += (Math.random()-0.5)*(nature.displayWidth*0.1)

        nature.setScale(4,4).refreshBody();

        nature.depth = nature.y;

        // if this thing HAS a body, create it
        if(bodies[randFrameIndex]) {
          var actualBody = this.natureBodiesActual.create(nature.x, nature.y, null);
          actualBody.setOrigin(0.5, 1);
          actualBody.setVisible(false);
          actualBody.displayWidth = nature.displayWidth;
          actualBody.displayHeight = nature.displayHeight*0.25;
          actualBody.refreshBody();

          // also add shadow to the body
          this.shadowGraphics.fillEllipse(nature.x, nature.y, nature.displayWidth, nature.displayHeight*0.25, 10);
        }
      }

      // collide and overlap with player(s)
      this.physics.add.collider(this.playerBodiesActual, this.natureBodiesActual); 
      this.physics.add.overlap(this.playerBodies, this.natureBodies, this.playerBehindBuilding, null, this);

      //
      // Initialize the delivery system!
      // (create empty queue, place some starting event(s))
      //
      this.eventQ = [];
      this.curOutstandingOrders = 0;

      // let first building place some order
      this.addEventToQueue('placeOrder', 10, { 'building': this.grabRandomBuilding() });


      //
      // add variables for general counters (money, timer, etc.)
      // also create their text fields and initialize their values
      //

      // timer
      var moneyX = 30, moneyY = 30
      var timeSprite = this.add.sprite(moneyX, moneyY, 'hourglass');
      timeSprite.setScale(3,3);
      timeSprite.depth = this.canvas.height * 2;
      this.timeSprite = timeSprite;

      styleConfig.fontSize = 48;
      styleConfig.color = '#EEC39A';
      styleConfig.stroke = '#210F0C';
      styleConfig.strokeThickness = 5;

      this.timeText = this.add.text(moneyX + 20, moneyY, '5:00', styleConfig);
      this.timeText.setOrigin(0, 0.5);
      this.timeText.depth = this.canvas.height * 2;

      this.timeLeft = 60 * 5 + 1;
      this.updateTimer();

      // VERY IMPORTANT: Actually start the timer (wouldn't want to forget that :p)
      this.time.addEvent({ delay: 1000, callback: this.updateTimer, callbackScope: this, loop: true });


      // money
      var offsetFromTimer = 50
      var moneySprite = this.add.sprite(moneyX, moneyY + offsetFromTimer, 'moneyAnim');
      moneySprite.setScale(4, 4)
      moneySprite.anims.play('moneyRotate');
      moneySprite.depth = this.canvas.height*2;

      styleConfig.fontSize = 48;
      styleConfig.color = '#FFAAFF';
      styleConfig.stroke = '#330033';
      styleConfig.strokeThickness = 5;

      this.moneyText = this.add.text(moneyX + 20, moneyY + offsetFromTimer, 'M', styleConfig);
      this.moneyText.setOrigin(0, 0.5);
      this.moneyText.depth = this.canvas.height * 2;

      this.money = 25;
      this.updateMoney(0, null);

      //
      // finally, determine what to do, depending on if it's a restart or not
      //
      if(this.beingRestarted) {
        var oldPlayers = this.scene.get('gameOver').oldPlayers;

        // go through all old players and add them into the game again
        for(var i = 0; i < oldPlayers.length; i++) {
          this.addPlayer(oldPlayers[i].myPeer);
        }

        // call the startGame() function
        this.startGame()

      // if not a restart, initialize game in paused mode (VIP must wait for everyone to join, then start by pressing a button)
      } else {
        this.scene.pause();
      }
      
    },

    createWorkspace() {
      // find random starting location
      // NOTE/TO DO: There is something wrong with the mapCheck function
      // =>  makes an infinite loop, but why?
      var x,y;
      var margin = 3;
      do {
        x = Math.floor(Math.random() * (this.mapWidth - margin*2)) + margin;
        y = Math.floor(Math.random() * (this.mapHeight - margin*2)) + margin;
      } while( !this.mapCheck(x, y, 10, this.existingWorkspaces) );

      //
      // use the "bool shape" algorithm to create an IRREGULAR workspace shape
      // (whilst keeping track of the border for easy wall placement later)
      //

      // start two lists: points already processed, and current border points of the shape
      // add the first random point to both lists
      var processed = [ [x,y] ];
      var borderPoints = [ [x,y] ];
      var maxShapeSize = 20;

      this.createRoomFloor(x, y);

      var algorithmDone = false;
      var fillProbHorizontal = 0.9;
      var fillProbVertical = fillProbHorizontal * (2/3);
      while(!algorithmDone) {
        // take first point in border points
        var p = borderPoints.shift();

        // add to processed list
        processed.push(p);

        // go through neighbours
        var dirs = [[1,0], [-1,0], [0,1], [0,-1]];
        for(var i = 0; i < 4; i++) {
          var newPoint = [ p[0] + dirs[i][0], p[1] + dirs[i][1] ];

          // check if this is allowed according to the current map
          if( this.map[newPoint[0]][newPoint[1]] != 0) {
            continue;
          }

          // if not, fill it with a random probability
          var tempProb = (i <= 1) ? fillProbHorizontal : fillProbVertical;
          if(Math.random() <= tempProb) {
            borderPoints.push(newPoint);

            this.createRoomFloor(newPoint[0], newPoint[1]);
          }
        }

        // stop the algorithm when we have no more border points OR the shape is already large enough
        algorithmDone = (borderPoints.length <= 0 || processed.length > maxShapeSize);
      }

      //
      // create WALLS around the shape
      // 

      // in case we terminated because of maximum size, concatenate both lists (together, they hold all the points)
      processed = processed.concat(borderPoints);
      processed = this.shuffle(processed); // also, evaluate in random order

      var roadPoints = [[], [], [], []];
      var tablePoints = [];

      // go through all points
      for(var i = 0; i < processed.length; i++) {
        var p = processed[i];

        // check their neighbours
        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        var numWalls = 0;
        for(var d = 3; d >= 0; d--) {
          // each neighbour that EXISTS, ignore it (can't place a wall there!)
          var pX = p[0] + dirs[d][0], pY = p[1] + dirs[d][1];
          if(this.map[pX][pY] == 5) {
            continue;
          }

          numWalls++;

          // otherwise, place a wall
          // use index "d" to determine the rotation/placement of the wall
          var wall;

          if(d == 0 || d == 2) {
            wall = this.add.sprite(pX * this.tileWidth, pY * this.tileHeight, 'staticAssets');
          } else {
            wall = this.wallBodies.create(pX * this.tileWidth, pY * this.tileHeight, 'staticAssets');
          }
          var secondWall = null;

          wall.setOrigin(0.5, 1);
          wall.y += 0.5*this.tileHeight;
          wall.setFrame(4 + d);

          if(d == 0 || d == 2) {
            wall.setFrame(4);

            // create an extra wall above us!
            // NOTE: The second wall does not have an overlap body, because we can never be behind it
            secondWall = this.add.sprite(wall.x, wall.y - this.tileHeight, 'staticAssets');
            secondWall.setOrigin(0.5, 1);
            secondWall.setFrame(6);

            if(d == 0) {
              wall.x -= (0.5)*this.tileWidth;
              secondWall.x = wall.x;
            } else {
              wall.x += (0.5)*this.tileWidth;
              secondWall.x = wall.x;
            }

            secondWall.setScale(4,4);
            secondWall.depth = wall.y;

          } else if(d == 1) {
            wall.y -= this.tileHeight;
          }

          wall.depth = wall.y;
          wall.setScale(4,4);

          // add wall shadow
          var offsetX = 5, offsetY = 0;
          this.shadowGraphics.fillRect(wall.x - 0.5*wall.displayWidth - offsetX, wall.y - wall.displayHeight + offsetY, wall.displayWidth, wall.displayHeight);

          // now create the ACTUAL body that will function as this wall
          var wallActual = this.wallBodiesActual.create(wall.x, wall.y, null);
          wallActual.displayWidth = wall.displayWidth;
          wallActual.displayHeight = wall.displayHeight * (1/4)

          if(d == 0 || d == 2) {
            wallActual.displayWidth = (1/5) * wall.displayWidth;
            wallActual.displayHeight = wall.displayHeight;
            //wallActual.y = wall.y - (0.5 - (1/8))*this.tileHeight;
          } else {

            // what's this? well, side walls (vertical) do not have an overlap body
            // so ONLY refresh the (original overlap) body if d != 0 and d != 2
            wall.refreshBody();
          }

          wallActual.setOrigin(0.5, 1);
          wallActual.refreshBody();
          wallActual.setVisible(false);
          wall.myActual = wallActual;

          if(d == 0 || d == 2) {
            var secondWallActual = this.wallBodiesActual.create(secondWall.x, secondWall.y, null)
            secondWallActual.displayWidth = (1/5) * wall.displayWidth;
            secondWallActual.displayHeight = (1/4)*wall.displayHeight;
            secondWallActual.setOrigin(0.5, 1);
            secondWallActual.refreshBody();
            secondWallActual.setVisible(false);

            secondWall.myActual = secondWallActual;
          }

          

          if(this.map[pX][pY] == 0) {
            // save that there's a possible road point in this direction
            // AND which wall we'd need to remove to get there
            roadPoints[d].push( [p[0], p[1], wall, secondWall] );
          }
        }

        // only allow tables with ALL empty space around them
        // TO DO: Alternative is allowing tables when pushed up against a wall, or some more complex check that runs through all points
        if(numWalls == 0) {
          tablePoints.push(p);
        }
      }

      // go through some roadPoints, shuffled 
      // (but don't actually shuffle it, otherwise we lose the direction)
      var numOpenings = 2;
      var curOpenings = 0;
      var curCounter = 0;
      var chosenOpenings = [];
      while(curOpenings < numOpenings) {
        if(roadPoints[curCounter] == null) { continue; }
        if(roadPoints[curCounter].length <= 0) { continue; } // TO DO: Check if ALL roadPoints are exhausted
        curCounter = (curCounter + 1) % 4;

        // skip directions randomly
        if(Math.random() <= 0.75) { continue; }

        // pick a random point
        // also REMOVE it from the list, so it's not used twice
        var rP = roadPoints[curCounter].splice(Math.floor(Math.random() * roadPoints[curCounter].length), 1)[0];

        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        var finalDir = (curCounter+2)%4; // again, reversed
        
        // if this road would be impossible (edge of map), don't do it
        // NOTE: Should already be checked when ADDING possible roads
        /*if(this.map[ rP[0] + dirs[finalDir][0] ][rP[1] + dirs[finalDir[1]] ] == -1) {
          continue;
        }*/

        // destroy the wall
        // (and the extra wall, if necessary)
        rP[2].myActual.destroy();
        rP[2].destroy();
        if(rP[3] != null) { rP[3].myActual.destroy(); rP[3].destroy(); }

        // remember the opening we chose, so we make sure not to place something there (like a table)
        chosenOpenings.push([rP[0], rP[1]]);

        // extend the road in the specificed direction
        this.extendRoad(rP[0], rP[1], dirs, finalDir);

        curOpenings++;
      }

      //
      // place tables in the work space
      // grab randomly from possible table points, don't allow tables at openings
      //
      var numTables = 5;
      for(var i = 0; i < numTables; i++) {
        if(tablePoints.length <= 0) { break; }

        var p = tablePoints.splice(Math.floor(Math.random() * tablePoints.length), 1)[0];

        // if it's an opening, continue, but decrease iterator
        var isOpening = false;
        for(var o = 0; o < chosenOpenings.length; o++) {
          if(chosenOpenings[o][0] == p[0] && chosenOpenings[o][1] == p[1]) {
            isOpening = true;
            break;
          }
        }
        if(isOpening) { i--; continue; }

        var table = this.createTable(p[0], p[1]);
      }

      //
      // once we have our shape, we must fill it
      // 1) determine the edges of the shape; place WALLS there
      // 2) leave several spots open; these are doors so extend ROADS to them.
      // 3) Any cell that was used for a wall, can be turned into a table => to ensure minimum of X tables, pick randomly from list
      //

      // finally, add to existing workspaces
      this.existingWorkspaces.push({ 'x': x, 'y': y });
    },

    createTable(x, y) {
      // create the table body with right size and all
      var table = this.tableBodies.create(x * this.tileWidth, y * this.tileHeight, 'buildings');

      table.y += 0.5*this.tileHeight;
      table.setOrigin(0.5, 1);
      table.setScale(4,4).refreshBody();
      table.setFrame(28); // 28 = regular table, 29 = oven
      table.id = this.runningID++;

      // initialize tables empty
      // a table can only contain ONE type of thing => if you add more ingredients, they try to combine into a pizza
      table.myContent = -1;

      // create sprite that will show whatever the table contains
      table.myContentSprite = this.add.sprite(table.x, table.y - table.displayHeight, 'ingredients');
      table.myContentSprite.setScale(4,4);
      table.myContentSprite.setVisible(false);
      //table.myContentSprite.setFrame(table.myContent);

      // offset depth to make room for walls
      table.depth = table.y - 2;
      table.myContentSprite.depth = table.depth;

      // animate this sprite (just softly go up and down, repeat infinitely)
      var tween = this.tweens.add({
          targets: table.myContentSprite,
          y: { from: table.myContentSprite.y, to: table.myContentSprite.y - 16 },
          ease: 'Linear',       // 'Cubic', 'Elastic', 'Bounce', 'Back'
          duration: 1000,
          repeat: -1,
          yoyo: true
      });

      // add ACTUAL body
      var tableBody = this.tableBodiesActual.create(table.x, table.y, null);

      tableBody.setVisible(false);
      tableBody.displayWidth = table.displayWidth;
      tableBody.displayHeight = this.tileHeight;
      tableBody.setOrigin(0.5, 1);
      tableBody.refreshBody();

      // connect the table SPRITE (with all the information, visual stuff, etc.)
      // with its actual body
      tableBody.myTable = table;

      // add table to global map
      // 2 MEANS table
      this.map[x][y] = 2;

      return table
    },

    createRoomFloor(x,y) {
      // draw the corresponding sprite at this location
      var roomFloor = this.add.sprite(x * this.tileWidth, y * this.tileHeight, 'staticAssets');
      roomFloor.tint = 0xFF0000;
      roomFloor.setScale(4,4);
      roomFloor.depth = -1;

      // update map
      // 5 MEANS workfloor
      this.map[x][y] = 5;
    },

    restartGame() {
      // mark the scene as being restarted
      this.beingRestarted = true;

      // copy players to backup variable; clear the actual array
      this.scene.get('gameOver').oldPlayers = this.players;
      this.players = [];

      // restart this whole scene
      this.scene.restart();

      // NOTE: now, at the "create" function, it should automatically add all the players and call startGame()
    },

    startGame() {
      var numPlayers = this.players.length;

      // divide allergies randomly among players
      // but only if we have more than a single player!
      if(numPlayers > 1) {
        var allergies = [0,1,2,3,4];
        allergies = this.shuffle(allergies);

        var counter = 0;
        
        var doneDividing = false
        while(!doneDividing) {
          // give the next player the next allergy in line
          // modulo wrap both, for we don't know how long either must continue/repeat 
          this.players[counter % numPlayers].myAllergies.push(allergies[counter % allergies.length]);

          // we're done if every player has at least ONE thing and we've divided ALL allergies
          counter++;
          doneDividing = (counter >= numPlayers && counter >= allergies.length);
        }

        // finally, send out messages to all players to display their allergies!
        for(var i = 0; i < numPlayers; i++) {
          var p = this.players[i];
          var msg = { 'type': 'allergies', 'val': p.myAllergies };
          p.myPeer.send( JSON.stringify(msg) );
        }
      }

      // update money to match player count
      // (5 extra bucks per person, just to make things quicker/easier at the start)
      this.updateMoney(this.players.length*5, null);

      // send game over scene to the back 
      GAME.scene.keys.gameOver.scene.sleep();

      // resume the game state
      this.scene.resume();
    },

    convertVectorToRotation(vec) {
      if(vec[0] == 1) {
        return 2;
      } else if(vec[0] == -1) {
        return 0;
      } else if(vec[1] == 1) {
        return 3;
      } else {
        return 1;
      }
    },

    createBuilding(x, y, rotation, type) {
      // now create the building body! (with correct frame = rotation)
      var building = this.buildingBodies.create(x * this.tileWidth, y * this.tileHeight, 'buildings');

      // building.displayWidth = building.displayHeight = this.tileWidth;
      building.setOrigin(0.5, 1);
      building.y += 32*0.5;
      building.setScale(4,4).refreshBody();

      // find correct frame based on type
      // (they are just sets of 4, starting with the five ingredients)
      rotation = rotation + type*4;

      building.setFrame(rotation);
      building.depth = building.y;
      building.myOrder = null;
      building.myStatus = 'none';
      building.id = this.runningID++;

      // now create the ACTUAL building body, which is what we'll be COLLIDING with
      var actualBody = this.buildingBodiesActual.create(building.x, building.y, null);
      actualBody.setVisible(false);
      actualBody.setOrigin(0.5, 1);
      actualBody.displayWidth = building.displayWidth
      actualBody.displayHeight = (building.displayHeight - 3*4);
      actualBody.refreshBody();

      var offsetX = 5, offsetY = 0;
      this.shadowGraphics.fillRect(building.x - 0.5*building.displayWidth - offsetX, building.y - actualBody.displayHeight + offsetY, building.displayWidth, actualBody.displayHeight);


      return building;
    },

    addEventToQueue(evType, deltaTime, params) {
      // adds event at time it should be trigged, including correct properties/parameters
      var curTime = this.time.now + deltaTime
      this.eventQ.push({ 'time': curTime, 'type': evType, 'params': params });
    },

    checkEventQueue(time) {
      // if there are no events, return immediately!
      if(this.eventQ.length <= 0) {
        return;
      }

      var lastTime = -1;

      // as long as we have events that should have fired within the time frame ...
      while(lastTime < time) {
        // update time of last event
        lastTime = this.eventQ[0].time

        // if we've already exceeded the current timestamp, break
        if(lastTime > time) {
          break;
        }

        // remove first event from queue
        var ev = this.eventQ.shift();

        // execute the event!
        this.executeEvent(ev);
      }
    },

    grabRandomBuilding() {
      var randBuilding = null;
      do {
        randBuilding = this.buildingBodies.getChildren()[ Math.floor(Math.random() * this.buildingBodies.getChildren().length ) ];
      } while(randBuilding.myStatus != 'none');

      return randBuilding;
    },

    executeEvent(ev) {
      if(ev.type == 'placeOrder') {
        // Plan the next order event
        var randTime = Math.random() * 10000 + 10000;
        var randBuilding = this.grabRandomBuilding();

        this.addEventToQueue('placeOrder', randTime, { 'building': randBuilding });

        // if we already have too many orders, don't create a new one
        // otherwise, keep track of the currently outstanding orders
        var maxOrders = this.players.length;
        if(this.curOutstandingOrders >= maxOrders) {
          return;
        }
        this.curOutstandingOrders++;

        //
        // Generate a random order
        // (always start with dough, then just randomly add stuff on top)
        //
        var order = [1,0,0,0,0];
        var orderNumber = 1;
        var moIngNum = 1;

        for(var i = 1; i < 5; i++) {
          order[i] = Math.round(Math.random());
          orderNumber += order[i] * Math.pow(2, i);

          if(order[i] == 1) {
            moIngNum++;
          }
        }

        // save order on the building
        var b = ev.params.building;
        b.myOrder = orderNumber;
        b.myOrderIngredientNum = moIngNum;
        b.myOrderID++;

        // remember we're currently ORDERING a pizza (waiting for someone to collect the order)
        b.myStatus = 'ordering';

        // Activate area in front of building
        b.myArea.setVisible(true);
        b.myArea.enable = true;

        // Show a wobbling/jumping exclamation mark over the building
        b.myOrderMark.setVisible(true);
        b.myOrderMark.anims.play('orderJump', true);

        // Plan an event for this order ALMOST running out
        // 30 seconds before warning, then another 15 until it runs out
        var orderPickupTime = 30 * 1000;
        this.addEventToQueue('almostFailed', orderPickupTime, { 'building': b, 'id': b.myOrderID, 'statusCheck': 'ordering' });
      
      } else if(ev.type == 'almostFailed') {
        // if this building is STILL ordering, oh no!
        //  - turn on the hourglass animation
        //  - make the order mark flicker? (TO DO: Use a tween, but we'd need to do bookkeeping to remove the tween later)

        // NOTE: It _could_ happen that a building goes from ordering => waiting => none => ordering within that timespan
        // That's why we keep an ID that tracks the current order number, and add it to the event
        var b = ev.params.building;
        if(b.myStatus == ev.params.statusCheck && b.myOrderID == ev.params.id) {
          b.myHourglass.setVisible(true);
          b.myHourglass.anims.play('hourglass');

          // plan definite run out event
          var orderFailTime = 15 * 1000;
          if(ev.params.statusCheck == 'waiting') {
            orderFailTime = 30 * 1000;
          }
          this.addEventToQueue('orderFailed', orderFailTime, { 'building': b, 'id': b.myOrderID, 'statusCheck': ev.params.statusCheck });
        }
      
      } else if(ev.type == 'orderFailed') {

        // if the order timer has run out, but we're still ordering, we have failed ...
        var b = ev.params.building;
        if(b.myStatus == ev.params.statusCheck && b.myOrderID == ev.params.id) {
          this.failOrder(b);
        }
      
      }
    },

    mapCheck(x, y, radius = -1, checkAgainst = null) {
      // if no check array was set, simply return whether this entry of the map is 0
      if(checkAgainst == null) {
        return (this.map[x][y] == 0);
      }

      // regardless of what we're doing, if the current value isn't 0, we simply return false
      if(this.map[x][y] != 0) {
        return false;
      }

      // otherwise, go through all locations in the array (which MUST be grid locations, not pixel locations)
      // and check if their distance is within the radius
      for(var i = 0; i < checkAgainst.length; i++) {
        var distance = Math.abs(checkAgainst[i].x - x) + Math.abs(checkAgainst[i].y - y);
        if(distance <= radius) {
          return false;
        }
      }

      return true;
    },

    extendRoad(x, y, customDirs = null, customInd = null) {
      // all 4 directions around (x,y)
      var dirs = [[1,0], [0,1], [-1,0], [0,-1]];

      // pick one at random + remove it from array
      dirs = this.shuffle(dirs);
      var randDir = null;
      for(var i = 0; i < dirs.length; i++) {
        if(this.map[ (x - dirs[i][0]) ][ (y - dirs[i][1]) ] == 0) {
          randDir = dirs.splice(i, 1)[0];
          break;
        }
      }

      // take over the custom dirs (if available)
      if(customDirs != null) {
        dirs = customDirs;
        randDir = customDirs.splice(customInd, 1)[0];
      }

      // now place a road at the INVERTED position 
      // (why? because now all remaining directions are possible road directions!)

      // 3 MEANS (default) road
      var startX = (x - randDir[0]), startY = (y - randDir[1]);
      this.map[startX][startY] = 3;

      // now try to find a road to connect to in all other directions
      var path = [];
      var bestPath = [];
      var foundRoad = false;
      for(var i = 0; i < dirs.length; i++) {
        var tempX = startX, tempY = startY;
        var d = dirs[i];

        // reset path and try again
        if(path.length > 1) {
          bestPath = path;
        }
        path = [];

        // continue searching until we find some obstacle
        // TO DO/NOTE: This breaches the border of the map (doesn't stop at -1 cell)... but I actually like that
        do {
          // check for roads at all neighbours!
          // but ignore the direction we're coming from
          var neighDirs = [[1,0], [0,1], [-1,0], [0,-1]];
          for(var neighDir = 0; neighDir < 4; neighDir++) {
            var neighbourDirection = neighDirs[neighDir];
            if(neighbourDirection[0] == -d[0] && neighbourDirection[1] == -d[1]) {
              continue;
            }

            if(this.map[tempX + neighbourDirection[0]][tempY + neighbourDirection[1]] == 3) {
              foundRoad = true;
              break;
            }
          }

          // if we found a road to attach to, hooray!
          // stop searching altogether
          if(foundRoad) {
            break;
          }

          // otherwise, continue along a straight line
          tempX += d[0];
          tempY += d[1];

          // check if this is a valid move before adding it to the path!
          if(this.map[tempX][tempY] != 0) {
            break;
          }

          path.push({ 'x': tempX, 'y': tempY })

        } while(this.map[tempX][tempY] == 0);

        // if we found a road, stop this whole process
        if(foundRoad) {
          break;
        }
      }

      // if the path has no length, use the best found path instead
      if(path.length <= 0) {
        path = bestPath;
      }

      // and add the first road back
      path.unshift({ 'x': startX, 'y': startY });

      // finally, update the map and create the correct sprites
      for(var i = 0; i < path.length; i++) {
        var p = path[i];
        this.map[p.x][p.y] = 3;

        var newRoad = this.add.sprite(p.x * this.tileWidth, p.y * this.tileWidth, 'staticAssets');

        newRoad.setScale(4,4);
        newRoad.depth = -1; // road is on the ground, so always "behind" the rest
      }

      // return the direction we've chosen
      // (could be used by the caller)
      return randDir;
    },

    playerBehindBuilding(player, building) {
      // check if the building is actually IN FRONT of the player
      if(player.depth > building.depth) {
        return;
      }

      // check if this one is already in the list
      var alreadyListed = false;
      for(var i = 0; i < player.obstructingObjects.length; i++) {
        if(player.obstructingObjects[i].id == building.id) {
          alreadyListed = true;
        }
      }

      if(alreadyListed) {
        return;
      }

      // if not, add it
      player.obstructingObjects.push(building);
    },

    playerAtTable(player, table) {
      // grab the actual player sprite, as "player" is the BODY (different things)
      player = player.myPlayer;

      // if this player is already using this table, ignore the rest of this
      if(player.currentTable != null) {
        return;
      }

      // if we just entered the collision, register the table and send a message
      player.currentTable = table.myTable;
      
      this.sendTableMessage(player, table.myTable);
    },

    sendTableMessage(player, table) {
      // find all players connected to this table
      for(var i = 0; i < this.players.length; i++) {
        // ignore players who do not match table id
        var p = this.players[i];
        if(p.currentTable == null || p.currentTable.id != table.id) {
          continue;
        }

        // send (personalized) message
        var msg = { 'type': 'table', 'content': table.myContent, 'backpack': p.myIngredients };
        p.myPeer.send( JSON.stringify(msg) );
      }
    },

    ingameFeedback(initiator, msg, color = "#FF0000") {
      // create text (place it centred above the initiator, whatever/whomever that is)
      var x = initiator.x;
      var y = initiator.y - initiator.displayHeight;
      var config = {
        fontFamily: "VT323",
        fontSize: 24,
        color: color,
      };
      var fbText = this.add.text(x, y, msg, config);
      fbText.setOrigin(0.5, 0.5);
      fbText.depth = initiator.depth;

      // tween it upwards (and fade out)
      var tween = this.tweens.add({
            targets: fbText,
            y: { from: y, to: y - 16 },
            alpha: { from: 1.0, to: 0.0 },
            ease: 'Linear',
            duration: 2000,
            repeat: 0
        });

      // remove automatically when done
      tween.on('complete', function(tween, targets) {
        fbText.destroy();
      }, this);
    },

    pickupIngredient(peer) {
      // grab player and ingredient type on our current table
      var player = this.players[peer.playerGameIndex];

      if(player.currentTable == null) {
        this.ingameFeedback(player, 'Not at a table!');
        console.log("Error: tried to pick up from non-existent table");
        return;
      }

      var ingredientType = player.currentTable.myContent;

      if(ingredientType < 0) {
        this.ingameFeedback(player, 'Nothing to pick up!');
        console.log("Error: tried to pick up ingredient that wasn't there");
        this.sendTableMessage(player, player.currentTable);
        return;
      }

      if(this.hasAllergy(player, ingredientType)) {
        this.ingameFeedback(player, 'You are allergic to this!');
        console.log("Error: tried to pick up ingredient you are allergic to");
        return;
      }

      // update our backpack
      var result = this.updateIngredient(peer, ingredientType, 1);

      if(!result) {
        this.ingameFeedback(player, 'No space in backpack!');
        console.log("Error: no space in backpack to pick up ingredient from table");
        this.sendTableMessage(player, player.currentTable);
        return;
      }

      // update the table
      player.currentTable.myContent = -1;
      player.currentTable.myContentSprite.setVisible(false);

      // send response back (simply an UPDATE on the table status)
      this.sendTableMessage(player, player.currentTable);
    },

    hasAllergy(player, ing) {
      // decompose the ingredient
      var decIng = this.decomposeIngredient(ing);

      // check each existing ingredient against the player allergies
      var myAll = player.myAllergies;
      for(var i = 0; i < decIng.length; i++) {
        // if the ingredient doesn't exist, ignore it
        if(decIng[i] == 0) { continue; }

        // if it does, check all the player's allergies
        // if this number is in there, we are allergic
        for(var a = 0; a < myAll.length; a++) {
          if(i == myAll[a]) {
            return true;
          }
        }
      }

      // if all checks fail, we are NOT allergic
      return false;
    },

    convertToBinary(num) {
      var binary = [];
      while(num > 0) {
        binary.push( (num % 2) );
        num = Math.floor(num / 2);
      }

      return binary;
    },

    decomposeIngredient(oldIng) {
      // this array will contain the COMBINATION/MIX of ingredients
      var ingArr = [0,0,0,0,0];

      // if this is an "empty" ingredient, return an empty array (how fitting)
      // (this is how combinations start: one empty table, one ingredient from the player)
      if(oldIng < 0) {
        return ingArr;
      }

      // now break the oldIngredient down to binary code
      var bin = this.convertToBinary(oldIng);

      // copy binary to ingredient array (leaving non-existent values to zero)
      for(var i = 0; i < bin.length; i++) {
        ingArr[i] = bin[i];
      }

      return ingArr;
    },

    combineIngredients(oldIng, newIng) {
      // first, decompose both ingredients
      var oldMix = this.decomposeIngredient(oldIng);
      var newMix = this.decomposeIngredient(newIng);

      // now combine them, capping values at 0 or 1
      // simply calculate the real value as we do it
      var finalMix = [0,0,0,0,0];
      var finalIng = 0;
      var numSlotsFilled = 0;
      for(var i = 0; i < oldMix.length; i++) {
        finalMix[i] = Math.max(oldMix[i], newMix[i]);
        finalIng += finalMix[i] * Math.pow(2, i);

        if(finalMix[i] > 0) {
          numSlotsFilled++;
        }
      }

      // If it's a single ingredient (one slot filled), it's always good
      // If it has multiple ingredients, we must have dough in it
      // (No ingredients is never valid, of course)
      var isValid = (numSlotsFilled == 1 || (numSlotsFilled > 1 && finalMix[0] > 0));
      if(!isValid) {
        console.log("Error: empty combination or lack of dough!");
        return -1;
      }

      return finalIng;   
    },

    dropIngredient(peer, ing) {
      // Basic error checks
      var player = this.players[peer.playerGameIndex];

      if(player.currentTable == null) {
        this.ingameFeedback(player, 'Not at a table!');
        console.log("Error: tried to drop ingredient on non-existent table");
        return;
      }

      // Combine ingredients!
      var newContent = this.combineIngredients(player.currentTable.myContent, ing);
      if(newContent == -1) {
        this.ingameFeedback(player, 'Can\'t combine ingredients!');
        console.log("Error: invalid combination of ingredients!");
        this.sendTableMessage(player, player.currentTable);
        return;
      }

      // update the table (content + sprite)
      player.currentTable.myContent = newContent;
      player.currentTable.myContentSprite.setVisible(true);
      player.currentTable.myContentSprite.setFrame(newContent);

      // update player backpack
      this.updateIngredient(peer, ing, -1);

      // send response back (an UPDATE on table/backpack status)
      this.sendTableMessage(player, player.currentTable);
    },

    playerAtArea: function(player, area) {
      // if this player does NOT have an assigned area yet, and this area is NOT currently being used
      if(player.currentArea == null && !area.beingUsed) {
        // if this building does nothing special, we do nothing special
        if(area.myBuilding.myStatus == 'none') {
          return;
        }

        if(area.myBuilding.myStatus == 'waiting') {
          var weHaveIt = false;
          for(var i = 0; i < player.myIngredients.length; i++) {
            if(player.myIngredients[i] == area.myBuilding.myOrder) {
              // yay, we have the right thing
              weHaveIt = true;
            }
          }

          if(!weHaveIt) {
            console.log("Error: Nah, you don't have what should be delivered here");
            return;
          }
        }

        // otherwise, send an area message with the building status included
        var msg = { 'type': 'area', 'status': area.myBuilding.myStatus };
        player.currentArea = area;
        player.myPeer.send( JSON.stringify(msg) );

        area.beingUsed = true;
      }
    },

    takeOrder: function(peer) {
      var player = this.players[peer.playerGameIndex];

      // check if all necessary variables are present
      if(player == undefined || player.currentArea == null) {
        this.ingameFeedback(player, 'No order to take!');
        console.log("Error: trying to take an order without being in an area");
        return;
      }

      // check if this building is actually ordering
      if(player.currentArea.myBuilding.myStatus != 'ordering') {
        this.ingameFeedback(player, 'This building has no order');
        console.log("Error: no, this building is not ordering a pizza");
        return;
      }

      // get order info
      var b = player.currentArea.myBuilding;
      var orderInfo = player.currentArea.myBuilding.myOrder;

      // change building state from "ordering" to "waiting"
      b.myStatus = 'waiting';

      // remove this order from the accumulative total
      this.curOutstandingOrders--;

      // plan the delivery ran out event
      // you have one minute for delivery, then 30 seconds before it's definitely over
      // NO, time depends on complexity of the order; 15 seconds per ingredient
      var deliveryTime = b.myOrderIngredientNum * 15 * 1000;
      console.log("PLANNING an almostFailed event, delta time is " + deliveryTime);
      this.addEventToQueue('almostFailed', deliveryTime, { 'building': b, 'id': b.myOrderID, 'statusCheck': 'waiting' });

      // remove exclamation mark
      b.myOrderMark.setVisible(false);
      b.myOrderMark.anims.stop();

      // Also change the visual state to match (show the current wanted pizza type)
      b.myOrderSprite.setVisible(true);
      b.myOrderSprite.setFrame(b.myOrder);

      // And hide/stop the hour glass, just in case it was busy doing stuff
      b.myHourglass.setVisible(false);
      b.myHourglass.anims.stop();
    },

    failOrder: function(b) {
      // remember status, it determines the gravity of the penalty
      var oldStatus = b.myStatus; 

      // first, reset all necessary stuff on the building itself
      b.myStatus = 'none';
      this.curOutstandingOrders--;

      b.myOrderSprite.setVisible(false);
      b.myOrderMark.setVisible(false);
      b.myArea.setVisible(false);
      b.myArea.enable = false;

      b.myHourglass.setVisible(false);
      b.myHourglass.anims.stop();

      // then, give a money penalty
      // (higher penalty if you failed the DELIVERY, instead of failing to pick up the order)
      var penalty = -( Math.floor(Math.random()*10)+10 );
      if(oldStatus == 'waiting') { penalty *= 2; }
      this.updateMoney(penalty, b, true)

      // and add a "strike" to the number of failed orders
      this.strikeSprites[this.numFailedOrders].setFrame(9);
      this.numFailedOrders++;

      // if we've failed too many times, go to game over - we lost
      if(this.numFailedOrders >= this.maxAllowedFails) {
        this.gameOver(false, 'too many strikes');
      }
    },

    deliverOrder: function(peer) {
      var player = this.players[peer.playerGameIndex];

      if(player == undefined || player.currentArea == null) {
        this.ingameFeedback(player, 'No building to deliver to');
        console.log("Error: no, you are not at an area");
        return;
      }

      // get order info
      var b = player.currentArea.myBuilding;
      var o = player.currentArea.myBuilding.myOrder;

      // update player backpack
      this.updateIngredient(peer, o, -1);

      // and GIVE US MONEYEEYEYEYYEYYEEY
      // at least 5 bucks per ingredient, plus some random extras
      var randMoney = b.myOrderIngredientNum * 5 + Math.floor(Math.random() * 15) + 5;
      this.ingameFeedback(player, randMoney + ' coins!', '#00FF00');
      this.updateMoney(randMoney, player);

      // remove our order sprite
      b.myOrderSprite.setVisible(false);

      // remove our area
      b.myArea.setVisible(false);
      b.myArea.enable = false;

      // And hide/stop the hour glass, just in case it was busy doing stuff
      b.myHourglass.setVisible(false);
      b.myHourglass.anims.stop();

      // reset status to none (we have our thing, stop whining about it)
      b.myStatus == 'none';
    },

    playerAtIngredient: function(player, ingLoc) {
      // if our current ingredient is null, update it to reflect our current ingredient spot
      if(player.currentIngredient == null) {
        var msg = { 'type': 'ing', 'ing': ingLoc.myNum, 'price': ingLoc.price }

        player.currentIngredient = msg;
        player.currentIngLocation = ingLoc;
        player.myPeer.send( JSON.stringify(msg) );
      }
    },

    buyAction: function(peer) {
      var player = this.players[peer.playerGameIndex]
      var buyInfo = player.currentIngredient;

      if(buyInfo == null || buyInfo == undefined) {
        this.ingameFeedback(player, 'Can\'t buy ingredient here!');
        console.log("Error: trying to buy an ingredient while not at a store");
        return;
      }

      if(this.hasAllergy(player, buyInfo.ing)) {
        this.ingameFeedback(player, 'You are allergic to this!');
        console.log("Error: tried to buy ingredient you are allergic to");
        return;
      }

      // add ingredient(s) to the player
      var result = this.updateIngredient(peer, buyInfo.ing, 1);

      // if the result is false, it means we don't have the space for this ingredient
      if(!result) {
        this.ingameFeedback(player, 'No space in backpack!');
        console.log("Error: trying to buy an ingredient you don't have space for (in your backpack");
        return
      }

      // subtract money (price for buying)
      var result = this.updateMoney(-buyInfo.price, player);
    },

    gameOver: function(win, reason) {
      this.scene.pause();

      // Clean the screen of all players
      // Give VIP option to restart
      for(var i = 0; i < this.players.length; i++) {
        var msg = { 'type': 'game-end' };
        this.players[i].myPeer.send( JSON.stringify(msg) );
      }

      // Overlay game over scene
      // (bring to top, update screen)
      var goScene = GAME.scene.keys.gameOver;
      goScene.scene.wake();

      // also tell players the reason (why they won/lost)
      goScene.setScreen(win, reason);
    },

    updateTimer: function() {
      this.timeLeft--;

      // convert number of seconds to more readable time format: MM:SS (minutes:seconds)
      // (with leading zeroes)
      var minutes = Math.floor(this.timeLeft / 60);
      var seconds = this.timeLeft % 60;

      if (minutes < 10) {minutes = "0"+minutes;}
      if (seconds < 10) {seconds = "0"+seconds;}

      // update text
      this.timeText.text = minutes+':'+seconds;
      
      // if timer is below 60, remind players that time is almost up
      if(this.timeLeft <= 60) {
        this.timeSprite.anims.play('hourglass');
      }

      // if timer is below 0, the round is over!
      // go to game over, display congratulatory message, yay!
      if(this.timeLeft <= 0) {
        this.gameOver(true, 'success');
      }
    },

    updateMoney: function(dm, initiator, penalty = false) {
      // if we don't have enough money for this ...
      if( (this.money + dm) < 0) {
        // if it's a PENALTY, we lost the game!
        if(penalty) {
          this.gameOver(false, 'no money');

        // otherwise, just give feedback and don't let the action through
        } else {
          this.ingameFeedback(initiator, 'Not enough money!');
          console.log("Error: trying to spend money you don't have");
          return false;
        }
      }

      this.money += dm;
      this.moneyText.text = this.money;

      return true;
    },

    updateIngredient: function(peer, ing, val) {
      // update actual value
      var player = this.players[peer.playerGameIndex];

      // check if we have space for this ingredient; if not, repulse it
      if((player.myIngredients.length+val) > player.backpackSize) {
        return false;
      }

      if(val > 0) {
        for(var i = 0; i < val; i++) {
          player.myIngredients.push(ing);
        }
      } else {
        // go through ingredients (in reverse order)
        // remove matching values until we've removed enough of them
        for(var i = (player.myIngredients.length-1); i >= 0; i--) {
          if(player.myIngredients[i] == ing) {
            player.myIngredients.splice(i, 1);
            val++;
          }

          if(val >= 0) {
            break;
          }
        }
      }

      // update visual representation
      for(var i = 0; i < player.backpackSize; i++) {
        // if something is here, show it (and set to right frame)
        if(i < player.myIngredients.length) {
          player.backpackSprites[i].setVisible(true);
          player.backpackSprites[i].setFrame(player.myIngredients[i]);
        
        // otherwise, hide it
        } else {
          player.backpackSprites[i].setVisible(false);
        }
      }

      // remember how much of our backpack is filled
      player.backpackSizeFilled = player.myIngredients.length;

      // yes, we were succesful!
      return true;

      /* OLD CODE => was used to write out global ingredient counts, but now players have personal backpacks
      var ingredientString = '';
      var ingredients = ['Dough', 'Tomatoes', 'Cheese', 'Spice', 'Vegetables']
      for(var i = 0; i < 5; i++) {
        ingredientString += ingredients[i] + ": " + this.ingredients[i] + "\n";
      }

      this.ingredientText.text = ingredientString;
      */
    },

    update: function(time, dt) {
      // check the event queue
      // (which should automatically handle events that should happen)
      this.checkEventQueue(time);

      // go through all players
      for(var i = 0; i < this.players.length; i++) {
        var p = this.players[i];

        // match position of player with position of their actual body
        // offset Y _slightly_ (+1) to make colliding with tables easier
        p.x = p.actualBody.x;
        p.y = p.actualBody.y - p.displayHeight + (0.25*0.5)*p.displayHeight + 1;

        // match shadow position
        p.shadowSprite.x = p.x;
        p.shadowSprite.y = p.y;

        // update their Z value for depth sorting
        // (we have a very simple Y-sort in this game)
        p.depth = p.y;

        // set backpack above the players
        var targetY = p.y - p.displayHeight - 16;
        var margin = 4;
        var spriteWidth = 32 + margin;
        for(var b = 0; b < p.backpackSprites.length; b++) {
          var s = p.backpackSprites[b];

          s.x = p.x - 0.5*p.backpackSizeFilled*spriteWidth + (b+0.5)*spriteWidth;
          s.y = targetY;

          s.depth = p.y;
        }

        // set text below the players 
        p.usernameText.x = p.x;
        p.usernameText.y = p.y + 0.5*p.displayHeight;

        // check if we've STOPPED overlapping our ingredient location
        if(p.currentIngLocation != null) {
          if(!this.checkOverlap(p, p.currentIngLocation)) {
            // if so, reset our variables
            p.currentIngLocation = null;
            p.currentIngredient = null;

            // send message over peer
            var msg = { 'type':'ing-end' }
            p.myPeer.send( JSON.stringify(msg) );
          }
        }

        // check if we've STOPPED colliding with a table
        // if we have a table saved, but we're not colliding with anything, we just EXITED the collision
        if(p.currentTable != null) {
          // highlight table
          p.currentTable.setFrame(30);

          if(!this.checkOverlap(p, p.currentTable)) {
            // reset table sprite
            p.currentTable.setFrame(28);

            // reset variables
            p.currentTable = null

            // send message over peer
            var msg = { 'type': 'table-end' }
            p.myPeer.send( JSON.stringify(msg) );
          }
        }

        // check if we've STOPPED overlapping an area
        if(p.currentArea != null) {
          if(!this.checkOverlap(p, p.currentArea)) {
            // if so, reset variables (both on player and area)
            p.currentArea.beingUsed = false;
            p.currentArea = null;

            // inform ourselves
            var msg = { 'type': 'area-end' }
            p.myPeer.send( JSON.stringify(msg) );
          }
        }

        // check if we need to change our OBSTRUCTING OBJECTS
        var numObstructions = p.obstructingObjects.length;
        if(numObstructions > 0) {
          for(var o = (numObstructions - 1); o >= 0; o--) {
            var obj = p.obstructingObjects[o];

            // if we do NOT overlap, or we are actually in FRONT of this thing, remove it
            if(!this.checkOverlap(p, obj) || p.depth >= obj.depth) {
              obj.alpha = 1.0;
              p.obstructingObjects.splice(o, 1);

            // otherwise, keep it as is
            } else {
              obj.alpha = 0.6;
            }
          }
        }
      }
    },

    checkOverlap: function(spriteA, spriteB) {
        var boundsA = spriteA.getBounds();
        var boundsB = spriteB.getBounds();

        return Phaser.Geom.Intersects.RectangleToRectangle(boundsA, boundsB);
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

      // scale it up! (both sprite and body)
      // make sure to maintain aspect ratio (11,16)
      var desiredHeight = 32;
      var scaleFactor = (desiredHeight/16);

      newPlayer.setScale(scaleFactor);
      newPlayer.setOrigin(0.5, 1.0);

      // create the actual BODY of the player
      var actualBody = this.playerBodiesActual.create(randX, randY, null);
      actualBody.setVisible(false);

      // actual size = 11,16 => body size = 11,4 => changed that to 9,3 just to be sure
      // NOTE: Perhaps consider making the body an ELLIPSE/ROUNDED RECTANGLE, because I've found that to move more smoothly around the world
      actualBody.setOrigin(0.5, 1.0);
      actualBody.setSize(9, 3);
      actualBody.setScale(scaleFactor);
      

      // create two-way street connection
      actualBody.myPlayer = newPlayer;
      newPlayer.actualBody = actualBody;

      // scale it up! => doesn't work, no idea why "this.body.updateFromGameObject()" is not a function
      // I know now: it's only available (and needed) for static bodies
      //newPlayer.setScale(4).refreshBody();

      // tint it (for now, to distinguish players)
      //newPlayer.tint = color.color;

      // add shadow
      var shadowSprite = this.add.sprite(newPlayer.x, newPlayer.y, 'staticAssets');
      shadowSprite.setFrame(3);
      shadowSprite.setScale(4,4);
      shadowSprite.alpha = 0.2;
      shadowSprite.depth = 0;
      newPlayer.shadowSprite = shadowSprite;

      // save player in array
      this.players.push(newPlayer);

      // save player index on peer
      peer.playerGameIndex = (this.players.length - 1);
      newPlayer.myPeer = peer;

      //
      // General properties of the player
      //
      newPlayer.currentIngredient = null;
      newPlayer.currentIngLocation = null;
      newPlayer.myIngredients = [];

      newPlayer.currentTable = null;

      newPlayer.currentArea = null;

      newPlayer.obstructingObjects = [];

      newPlayer.myAllergies = [];

      //
      // ingredients/backpack container
      //
      newPlayer.backpack = this.add.group();
      newPlayer.backpack.setOrigin(0.5, 0.5);

      newPlayer.backpackSize = 3;
      newPlayer.backpackSprites = [];
      newPlayer.backpackSizeFilled = 0;
      for(var i = 0; i < newPlayer.backpackSize; i++) {
        var tempS = newPlayer.backpack.create(i*32, 0, 'ingredients');

        tempS.displayHeight = tempS.displayWidth = 32;
        tempS.setVisible(false);

        newPlayer.backpackSprites.push(tempS);
      }

      //
      // create text to show player username
      // (and make it a child of player body)
      //
      var config = {font: "24px VT323",
            fontWeight: "bold",
            fill: "#000000"
          };

      var tX = newPlayer.x, tY = newPlayer.y + 0.5*newPlayer.displayHeight;
      var text = this.add.text(tX, tY, peer.curClientUsername, config);
      text.setOrigin(0.5);
      newPlayer.usernameText = text;

      // send player its player index, if it's the first player
      // TO DO: Perhaps change this to send player number to ALL players, then just listen (smartphone side) to see if it's 0
      if(!this.beingRestarted) {
        var playerIndex = (this.players.length - 1)
        if(playerIndex == 0) {
          var msg = { 'type': 'lobby', 'ind': playerIndex };
          peer.send( JSON.stringify(msg) );
        }
      }
    },

    updatePlayer: function(peer, vec) {
      // check if player even exists
      if(peer.playerGameIndex >= this.players.length) {
        console.log("No player with index " + peer.playerGameIndex);
        return;
      }

      var player = this.players[peer.playerGameIndex];
      var speed = 120;

      // just move the player according to velocity vector
      // var curVel = player.velocity
      player.actualBody.setVelocity(vec[0] * speed, vec[1] * speed);

      // if we should stop, play idle animation
      if(vec[0] == 0 && vec[1] == 0) {
        player.anims.play('idle', true);

      // otherwise, play run animation
      } else {
        player.anims.play('run', true);
      }

      // flip properly (on the horizontal axis) if moving the other way
      if(vec[0] < 0) {
        player.flipX = true;
      } else if(vec[0] > 0) {
        player.flipX = false;
      }
    },

    shuffle: function(a) {
        var j, x, i;
        for (i = a.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            x = a[i];
            a[i] = a[j];
            a[j] = x;
        }
        return a;
    }

});

// STUFF (devlog) about scenes: https://phaser.io/phaser3/devlog/121
var GameOver = new Phaser.Class({

    Extends: Phaser.Scene,

    initialize:
    function GameOver()
    {
        Phaser.Scene.call(this, { key: 'gameOver', active: true });
    },

    preload: function() {
      this.load.crossOrigin = 'Anonymous';
      this.load.spritesheet('gameOver', 'assets/gameOver.png', { frameWidth: 64, frameHeight: 64 });
    },

    create: function() {
      this.canvas = this.sys.game.canvas;

      // create background screen (that "pops up" on game over)
      var bgScreen = this.add.sprite(0.5*this.canvas.width, 0.5*this.canvas.height, 'gameOver');
      bgScreen.setScale(8,8);
      bgScreen.setFrame(0);

      // create main text (the big and attention grabbing "YOU WON/YOU LOST")
      var mainText = this.add.text(bgScreen.x, bgScreen.y - (0.5 - 0.125)*bgScreen.displayHeight + 64, 'YOU WON!');
      var styleConfig = {
        fontFamily: '"VT323"',
        align: 'left',
        color: 'rgba(0,0,0,0.8)',
        fontSize: 64,
        wordWrap: { width: bgScreen.displayWidth - 32*2, useAdvancedWrap: true }
      }

      mainText.setStyle(styleConfig);
      mainText.setOrigin(0.5, 0.5);

      // create body text, that explains the results and what to do now
      styleConfig.fontSize = 24;
      var bodyText = this.add.text(bgScreen.x - 0.5*bgScreen.displayWidth + 32, mainText.y + 32 + 32, 'Lorum ipsum');
      bodyText.setStyle(styleConfig);
      bodyText.setOrigin(0, 0);

      this.bgScreen = bgScreen;
      this.mainText = mainText;
      this.bodyText = bodyText;

      // start with the lobby screen
      this.setScreen(false, 'game lobby');
    },

    setScreen: function(win, reason) {
      // special case: game lobby
      if(reason == 'game lobby') {
        this.mainText.text = 'JOIN NOW!';
        this.bodyText.text = 'Enter the room code (bottom right) and a username to join.\n\n\n Once everyone\'s in, the VIP (first player to connect) has a button to start the game!';
        return;
      }

      // whether we won or lost, determines the background color (sprite frame) and some other properties
      if(win) {
        this.bgScreen.setFrame(0);
        this.mainText.text = 'YOU WON!';
      } else {
        this.bgScreen.setFrame(1);
        this.mainText.text = 'YOU LOST!';
      }

      if(reason == 'no money') {
        this.bodyText.text = 'You ran out of money ...';
      } else if(reason == 'too many strikes') {
        this.bodyText.text = 'You failed too many orders ...';
      } else if(reason == 'success') {
        this.bodyText.text = 'You are the best pizza peers, probably, presumably, practically!';
      }

      this.bodyText.text += '\n\nWant to play again? The VIP has a button to restart.'
    }
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
    scene: [SceneA, GameOver],
    physics: {
        default: 'arcade',
        arcade: { 
          debug: false,
        }
    },
    pixelArt: true,
    antialias: false,
  }

  GAME = new Phaser.Game(config);
}

