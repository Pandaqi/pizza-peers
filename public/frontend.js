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

      console.log('CONNECT');

      // yay, we're connected!

      // if we were the initiator of a connection, we are a PLAYER
      if(initiator) {
        // TO DO: Go to lobby screen on phone

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

      if(peer.isConnected) {
        var dynInt = document.getElementById('dynamicInterface');

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
            btn.innerHTML = "<span>Drop</span><div class='ingSprite' style='background-position:-" + (curIng*32) + "px 0;'></div><span>on the table</span>";
            dynInt.appendChild(btn);
            
            // tell computer to drop this ingredient
            btn.addEventListener ("click", function() {
              var msg = { 'type': 'table-drop', 'ing': curIng };
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
    document.getElementById("messageForm").style.display = 'block';

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

    function SceneA ()
    {
        Phaser.Scene.call(this, { key: 'sceneA' });

        this.players = [];
    },

    preload: function() {
       this.load.crossOrigin = "Anonymous"; // to solve CORS bullshit
       this.canvas = this.sys.game.canvas;

       // images
       this.load.image('money', 'assets/moneyIcon.png');

       // spritesheets
       this.load.spritesheet('dude', 'assets/playerCharacter.png', { frameWidth: 11, frameHeight: 16 });
       this.load.spritesheet('ingredients', 'assets/ingredientIcons.png', { frameWidth: 8, frameHeight: 8 });
       this.load.spritesheet('staticAssets', 'assets/table.png', { frameWidth: 8, frameHeight: 8 });
       this.load.spritesheet('buildings', 'assets/buildings.png', { frameWidth: 8, frameHeight: 8 });

       this.load.spritesheet('orderMark', 'assets/orderMark.png', { frameWidth: 8, frameHeight: 12 });

    },

    create: function() {
      // add room code at top right
      // NO, for now keep it simple, it's top left
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

      // make sure everything collides
      this.physics.add.collider(this.playerBodies); // players collide with each other
      this.physics.add.collider(this.boundBodies, this.playerBodies); // players collide with level bounds

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

      //
      // generate random city
      //
      this.tileWidth = 32;
      this.tileHeight = 32;
      this.gameWidth = this.canvas.width;
      this.gameHeight = this.canvas.height;

      this.mapWidth = Math.floor(this.gameWidth / this.tileWidth);
      this.mapHeight = Math.floor(this.gameHeight / this.tileHeight);

      // 1) Create random map (2D grid) that fills the screen
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

      //
      // 2) Add ingredient locations at random
      //
      var baseIngredients = [1,2,4,8,16];
      var numIngLoc = 8;

      // shuffle ingredients (for random distribution)
      baseIngredients = this.shuffle(baseIngredients);

      // go through all ingredient locations
      var tempIngLocs = [];
      this.ingredientBodies = this.physics.add.staticGroup();
      for(var i = 0; i < numIngLoc; i++) {
        // keep looking for new locations until we find an empty spot
        var x,y
        do {
          x = Math.floor(Math.random() * this.mapWidth);
          y = Math.floor(Math.random() * this.mapHeight);
        } while( !this.mapCheck(x, y, 5, tempIngLocs) );

        // 1 MEANS ingredients
        this.map[x][y] = 1;

        // remember this thing, so we can avoid placing stuff next to it in the world generation!
        tempIngLocs.push({ 'x': x, 'y': y });

        // then create the body with the right size, type, price, etc.
        var ing = this.ingredientBodies.create(x * this.tileWidth, y * this.tileHeight, 'ingredients');

        ing.displayWidth = ing.displayHeight = this.tileWidth;
        ing.setSize(this.tileWidth, this.tileWidth).refreshBody();

        // set some properties => ingredient type and price
        // (modulo wrap the baseIngredients array to get a few duplicates around the map)
        ing.myNum = baseIngredients[i % (baseIngredients.length)];
        ing.price = Math.floor(Math.random() * 5) + 1;

        // do NOT use .frame as a property!
        ing.setFrame(ing.myNum);

        // create single road piece next to it
        // (this algorithm creates a road, tries to connect it to an existing road => if it fails, it extends the road as far as it can go (probably the edge of the screen)
        this.extendRoad(x,y);
      }
      
      // finally, check for overlap between players and ingredients
      this.physics.add.overlap(this.playerBodies, this.ingredientBodies, this.playerAtIngredient, null, this);

      //
      // 3) create some tables for storage/cutting/combining/ baking??
      //
      this.tableBodies = this.physics.add.staticGroup();
      var numTables = 8;

      for(var i = 0; i < numTables; i++) {
        // keep looking for new locations until we find an empty spot
        var x,y
        do {
          x = Math.floor(Math.random() * this.mapWidth);
          y = Math.floor(Math.random() * this.mapHeight);
        } while( !this.mapCheck(x,y, 5, tempIngLocs) );

        // 2 MEANS (default) table
        this.map[x][y] = 2;

        // now also consider all tables when checking the map
        tempIngLocs.push({ 'x': x, 'y': y });

        // create the table body with right size and all
        var table = this.tableBodies.create(x * this.tileWidth, y * this.tileHeight, 'staticAssets');

        table.displayWidth = table.displayHeight = this.tileWidth;
        table.setSize(this.tileWidth, this.tileWidth).refreshBody();
        table.setFrame(1);

        // initialize tables empty
        // a table can only contain ONE type of thing => if you add more ingredients, they try to combine into a pizza
        table.myContent = -1;

        // create sprite that will show whatever the table contains
        // TO DO: in the real game, tables would be initialized as empty
        table.myContentSprite = this.add.sprite(table.x, table.y - table.displayHeight, 'ingredients');
        table.myContentSprite.setScale(4,4);
        table.myContentSprite.setVisible(false);
        //table.myContentSprite.setFrame(table.myContent);

        table.z = table.y;
        table.myContentSprite.z = table.z;

        // animate this sprite (just softly go up and down, repeat infinitely)
        var tween = this.tweens.add({
            targets: table.myContentSprite,
            y: { from: table.myContentSprite.y, to: table.myContentSprite.y - 16 },
            ease: 'Linear',       // 'Cubic', 'Elastic', 'Bounce', 'Back'
            duration: 1000,
            repeat: -1,
            yoyo: true
        });

        // and extend the road
        this.extendRoad(x,y);
      }

      // make player and tables collide
      this.physics.add.collider(this.playerBodies, this.tableBodies, this.playerAtTable, null, this);

      //
      // 4) Place some buildings around the map
      //
      var numBuildings = 30;
      this.buildingBodies = this.physics.add.staticGroup();
      this.orderAreas = this.physics.add.staticGroup();
      for(var i = 0; i < numBuildings; i++) {
        console.log("Creating building " + i);

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
        var ind = dirs[rotation]
        if(ind[0] == 1) {
          rotation = 2;
        } else if(ind[0] == -1) {
          rotation = 0;
        } else if(ind[1] == 1) {
          rotation = 3;
        } else {
          rotation = 1;
        }

        // if it still doesn't have a road ...
        if(!hasRoad) {
          // extend the road (using our customly found direction and rotation)
          this.extendRoad(x, y, dirs, freeSpot);
        }

        // 4 MEANS building
        this.map[x][y] = 4;

        // now create the building body! (with correct frame = rotation)
        var building = this.buildingBodies.create(x * this.tileWidth, y * this.tileHeight, 'buildings');

        building.displayWidth = building.displayHeight = this.tileWidth;
        building.setSize(this.tileWidth, this.tileWidth).refreshBody();

        building.setFrame(rotation);
        building.z = building.y;
        building.myOrder = null;
        building.myStatus = 'none';

        // now create a body in front of it that will be used for taking/delivering orders
        var orderArea = this.orderAreas.create((x - ind[0]) * this.tileWidth, (y - ind[1]) * this.tileHeight, 'staticAssets');
        orderArea.setFrame(2);
        orderArea.setVisible(false);
        orderArea.enable = false;

        orderArea.setScale(4,4);

        orderArea.myBuilding = building;
        orderArea.z = building.z;

        // connect building with its area
        building.myArea = orderArea;

        // add order mark
        var orderMark = this.add.sprite(building.x, building.y - this.tileHeight*1.5, 'orderMark');
        orderMark.setVisible(false);
        orderMark.z = building.z;
        building.myOrderMark = orderMark;

        orderMark.setScale(4,4);

        // add order sprite
        var orderSprite = this.add.sprite(building.x, building.y - this.tileHeight*1.5, 'ingredients');
        orderSprite.setVisible(false);
        orderSprite.setScale(4,4);
        orderSprite.z = building.z;

        building.myOrderSprite = orderSprite;

        console.log("Done creating building " + i);
      }

      // make buildings and players collide
      this.physics.add.collider(this.playerBodies, this.buildingBodies);

      // make players and orderAreas overlap
      this.physics.add.overlap(this.playerBodies, this.orderAreas, this.playerAtArea, null, this);

      //
      // Initialize the delivery system!
      // (create empty queue, place some starting event(s))
      //
      this.eventQ = [];
      this.curOutstandingOrders = 0;

      // let first building place some order
      this.addEventToQueue('placeOrder', 10, { 'building': this.buildingBodies.getChildren()[0] });


      //
      // add variables for general counters (money, ingredients, etc.)
      // also create their text fields and initialize their values
      //
      this.money = 100;

      styleConfig.fontSize = 24;
      styleConfig.color = 'rgba(0,0,0,0.8)';

      var moneyX = 30, moneyY = 30
      var moneySprite = this.add.sprite(moneyX, moneyY, 'money');
      moneySprite.setScale(4, 4)

      this.moneyText = this.add.text(moneyX + 20, moneyY, 'M', styleConfig);
      this.moneyText.setOrigin(0, 0.5);

      this.updateMoney(0);
    },

    addEventToQueue(evType, deltaTime, params) {
      // adds event at time it should be trigged, including correct properties/parameters
      var curTime = this.time.now + deltaTime
      this.eventQ.push({ 'time': curTime, 'type': evType, 'params': params });
    },

    checkEventQueue(time) {
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

    executeEvent(ev) {
      if(ev.type == 'placeOrder') {
        // Plan the next order event
        var randTime = Math.random() * 8000 + 5000;
        var randBuilding = null;
        do {
          randBuilding = this.buildingBodies.getChildren()[ Math.floor(Math.random() * this.buildingBodies.getChildren().length ) ];
        } while(randBuilding.myStatus != 'none');

        this.addEventToQueue('placeOrder', randTime, { 'building': randBuilding });

        // if we already have too many orders, don't create a new one
        var maxOrders = 6;
        if(this.curOutstandingOrders >= maxOrders) {
          return;
        }

        this.curOutstandingOrders++;

        // Generate a random order
        var order = [1,0,0,0,0];
        var orderNumber = 1;

        for(var i = 1; i < 5; i++) {
          order[i] = Math.round(Math.random());

          if(order[i] == 1) {
            orderNumber += Math.pow(2, i);
          }
          
        }

        // save order on the building
        var b = ev.params.building;
        b.myOrder = orderNumber;

        // remember we're currently ORDERING a pizza (waiting for someone to collect the order)
        b.myStatus = 'ordering';

        // Activate area in front of building
        b.myArea.setVisible(true);
        b.myArea.enable = true;

        // Show a wobbling/jumping exclamation mark over the building
        b.myOrderMark.setVisible(true);
        b.myOrderMark.anims.play('orderJump', true);
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

    extendRoad(x,y, customDirs = null, customInd = null) {
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
      var foundRoad = false;
      for(var i = 0; i < dirs.length; i++) {
        var tempX = startX, tempY = startY;
        var d = dirs[i];

        // reset path and try again
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

          path.push({ 'x': tempX, 'y': tempY })

        } while(this.map[tempX][tempY] == 0);

        // if we found a road, stop this whole process
        if(foundRoad) {
          break;
        }
      }

      // and add the first road back
      path.unshift({ 'x': startX, 'y': startY });

      // finally, update the map and create the correct sprites
      for(var i = 0; i < path.length; i++) {
        var p = path[i];
        this.map[p.x][p.y] = 3;

        var newRoad = this.add.sprite(p.x * this.tileWidth, p.y * this.tileWidth, 'staticAssets');

        newRoad.setScale(4,4);
        newRoad.z = -1; // road is on the ground, so always "behind" the res
      }
    },

    playerAtTable(player, table) {
      // if this player is already using this table, ignore the rest of this
      if(player.currentTable != null) {
        return;
      }

      // if we just entered the collision, register the table and send a message
      player.currentTable = table;
      
      this.sendTableMessage(player, table);
    },

    sendTableMessage(player, table) {
      var msg = { 'type': 'table', 'content': table.myContent, 'backpack': player.myIngredients };
      player.myPeer.send( JSON.stringify(msg) );
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

        if(finalMix[i] > 0) {
          numSlotsFilled++;
        }

        if(finalMix[i] == 1) {
          finalIng += Math.pow(2, i);
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
      if(player.currentArea == null) {
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

      // remove exclamation mark
      // (TO DO: Stop animation; I don't know how)
      b.myOrderMark.setVisible(false);
      // b.myOrderMark.anims.stop();

      // Also change the visual state to match (show the current wanted pizza type)
      b.myOrderSprite.setVisible(true);
      b.myOrderSprite.setFrame(b.myOrder);
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
      var randMoney = Math.floor(Math.random() * 20) + 15;
      this.ingameFeedback(player, randMoney + ' coins!', '#00FF00');
      this.updateMoney(randMoney);

      // remove our order sprite
      b.myOrderSprite.setVisible(false);

      // remove our area
      b.myArea.setVisible(false);
      b.myArea.enable = false;

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

      // add ingredient(s) to the player
      var result = this.updateIngredient(peer, buyInfo.ing, 1);

      // if the result is false, it means we don't have the space for this ingredient
      if(!result) {
        this.ingameFeedback(player, 'No space in backpack!');
        console.log("Error: trying to buy an ingredient you don't have space for (in your backpack");
        return
      }

      // subtract money (price for buying)
      var result = this.updateMoney(-buyInfo.price);
    },

    updateMoney: function(dm) {
      // if we don't have enough money for this, repulse the action!
      if( (this.money + dm) < 0) {
        this.ingameFeedback(player, 'Not enough money!');
        console.log("Error: trying to spend money you don't have");
        return false;
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

        // update their Z value for depth sorting
        // (we have a very simple Y-sort in this game)
        p.z = p.y;

        // set backpack above the players
        var targetY = p.y - 0.5*p.displayHeight - 16;
        var margin = 4;
        var spriteWidth = 32 + margin;
        for(var b = 0; b < p.backpackSprites.length; b++) {
          var s = p.backpackSprites[b];

          s.x = p.x - 0.5*p.backpackSizeFilled*spriteWidth + (b+0.5)*spriteWidth;
          s.y = targetY;
        }

        // set text below the players 
        p.usernameText.x = p.x;
        p.usernameText.y = p.y + 0.5*p.displayHeight + 12;

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
          if(!this.checkOverlap(p, p.currentTable)) {
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
            p.currentArea = null;

            var msg = { 'type': 'area-end' }
            p.myPeer.send( JSON.stringify(msg) );
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

      // scale it up! => doesn't work, no idea why "this.body.updateFromGameObject()" is not a function
      //newPlayer.setScale(4).refreshBody();

      // tint it (for now, to distinguish players)
      newPlayer.tint = color.color;

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

      //
      // ingredients/backpack container
      //
      newPlayer.backpack = this.add.group();
      newPlayer.backpack.setOrigin(0.5, 0.5);

      newPlayer.backpackSize = 5;
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

      var text = this.add.text(0, 0, peer.curClientUsername, config);
      text.setOrigin(0.5);
      newPlayer.usernameText = text;
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
      // var curVel = player.velocity
      player.setVelocity(vec[0] * speed, vec[1] * speed);

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
        arcade: { 
          debug: false,
        }
    },
    pixelArt: true,
    antialias: false,
  }

  GAME = new Phaser.Game(config);
}

