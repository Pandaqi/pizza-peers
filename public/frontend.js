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

            console.log("BUY SOME INGREDIENTSSSS");
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

        if(data.type == 'table-pickup') {
          gm.pickupIngredient(peer);
        }

        if(data.type == 'table-drop') {
          gm.dropIngredient(peer, data.ing);
        }

        if(data.type == 'table-end') {
          dynInt.innerHTML = '';
        }
      }
    })
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
    gameDiv.addEventListener('mouseup', function(ev) { 
      mouseDown = false; 
      var msg = { 'type': 'move', 'vec': [0,0] };
      peers[0].send( JSON.stringify(msg) );
    });

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
       this.load.image('table', 'assets/table.png');
       this.load.image('money', 'assets/moneyIcon.png');

       // spritesheets
       this.load.spritesheet('dude', 'assets/playerCharacter.png', { frameWidth: 11, frameHeight: 16 });
       this.load.spritesheet('ingredients', 'assets/ingredientIcons.png', { frameWidth: 8, frameHeight: 8 });

    },

    create: function() {
      // add room code at top right
      // NO, for now keep it simple, it's top left
      var roomText = this.add.text(10, 10, 'Room: ' + connection.room);
      var styleConfig = {
        fontFamily: '"VT323"',
        align: 'right',
        color: '#000000',
        fontSize: 64
      }

      roomText.setStyle(styleConfig);

      //
      // add variables for general counters (money, ingredients, etc.)
      // also create their text fields and initialize their values
      //
      this.money = 100;

      styleConfig.fontSize = 24;
      var moneySprite = this.add.sprite(30, 100, 'money');
      moneySprite.setScale(4, 4)

      this.moneyText = this.add.text(50, 100, 'M', styleConfig);
      this.moneyText.setOrigin(0, 0.5);

      this.updateMoney(0);

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

      //
      // create some ingredient locations
      //
      this.ingredientBodies = this.physics.add.staticGroup();
      var numIngBodies = 8;

      for(var i = 0; i < numIngBodies; i++) {
        var margin = 50
        var randX = Phaser.Math.Between(margin, this.canvas.width - margin), 
            randY = Phaser.Math.Between(margin, this.canvas.height - margin);

        var ing = this.ingredientBodies.create(randX, randY, 'ingredients');

        ing.displayWidth = ing.displayHeight = 32;
        ing.setSize(32,32).refreshBody();

        var baseIngredients = [1, 2, 4, 8, 16];

        // set some properties (randomly for now) => ingredient type and price
        ing.myNum = baseIngredients[Math.floor(Math.random() * 5)];
        ing.price = Math.floor(Math.random() * 5) + 1;

        // do NOT use .frame as a property!
        ing.setFrame(ing.myNum);
      }

      this.physics.add.overlap(this.playerBodies, this.ingredientBodies, this.playerAtIngredient, null, this);

      //
      // create some tables for storage/cutting/combining
      //
      this.tableBodies = this.physics.add.staticGroup();
      var numTables = 5;

      for(var i = 0; i < numTables; i++) {
        // TO DO: Eventually, switch to a grid system and more unified/structured placement
        var margin = 50
        var randX = Phaser.Math.Between(margin, this.canvas.width - margin), 
            randY = Phaser.Math.Between(margin, this.canvas.height - margin);

        var table = this.tableBodies.create(randX, randY, 'table');

        table.displayWidth = table.displayHeight = 32;
        table.setSize(32,32).refreshBody();

        // initialize tables empty
        // a table can only contain ONE type of thing => if you add more ingredients, they try to combine into a pizza
        table.myContent = -1;

        // create sprite that will show whatever the table contains
        // TO DO: in the real game, tables would be initialized as empty
        table.myContentSprite = this.add.sprite(table.x, table.y - table.displayHeight, 'ingredients');
        table.myContentSprite.setScale(4,4);
        table.myContentSprite.setVisible(false);
        //table.myContentSprite.setFrame(table.myContent);

        // animate this sprite (just softly go up and down, repeat infinitely)
        var tween = this.tweens.add({
            targets: table.myContentSprite,
            y: { from: table.myContentSprite.y, to: table.myContentSprite.y - 16 },
            ease: 'Linear',       // 'Cubic', 'Elastic', 'Bounce', 'Back'
            duration: 1000,
            repeat: -1,
            yoyo: true
        });
      }

      // make player and tables collide
      this.physics.add.collider(this.playerBodies, this.tableBodies, this.playerAtTable, null, this);
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

    pickupIngredient(peer) {
      // grab player and ingredient type on our current table
      var player = this.players[peer.playerGameIndex];

      if(player.currentTable == null) {
        console.log("Error: tried to pick up from non-existent table");
        return;
      }

      var ingredientType = player.currentTable.myContent;

      if(ingredientType < 0) {
        console.log("Error: tried to pick up ingredient that wasn't there");
        return;
      }

      // update our backpack
      var result = this.updateIngredient(peer, ingredientType, 1);

      if(!result) {
        console.log("Error: no space in backpack to pick up ingredient from table");
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
      for(var i = 0; i < oldMix.length; i++) {
        finalMix[i] = Math.max(oldMix[i], newMix[i]);

        if(finalMix[i] == 1) {
          finalIng += Math.pow(2, i);
        }
      }

      // TO DO: if there's no dough, don't allow this combination
      var doChecksHere = false
      if(doChecksHere) {
        console.log("Error: no dough for combination!");
        return -1;
      }

      return finalIng;   
    },

    dropIngredient(peer, ing) {
      // Basic error checks
      var player = this.players[peer.playerGameIndex];

      if(player.currentTable == null) {
        console.log("Error: tried to drop ingredient on non-existent table");
        return;
      }

      // Combine ingredients!
      var newContent = this.combineIngredients(player.currentTable.myContent, ing);
      if(newContent == -1) {
        console.log("Error: invalid combination of ingredients!");
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
      var buyInfo = this.players[peer.playerGameIndex].currentIngredient;

      if(buyInfo == null || buyInfo == undefined) {
        console.log("Error: trying to buy an ingredient while not at a store");
        return;
      }

      // add ingredient(s) to the player
      var result = this.updateIngredient(peer, buyInfo.ing, 1);

      // if the result is false, it means we don't have the space for this ingredient
      if(!result) {
        console.log("Error: trying to buy an ingredient you don't have space for (in your backpack");
        return
      }

      // subtract money (price for buying)
      var result = this.updateMoney(-buyInfo.price);
    },

    updateMoney: function(dm) {
      // if we don't have enough money for this, repulse the action!
      if( (this.money + dm) < 0) {
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

    update: function(dt) {
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
  }

  GAME = new Phaser.Game(config);
}

