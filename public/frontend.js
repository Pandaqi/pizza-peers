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

    // if it's an ERROR somewhere in the process
    if(message.type == 'error') {
      // differentiate error message based on the type of error
      if(message.val == 'wrong room') {
        status.innerHTML = 'Sorry, that room does not exist. Reload and try again.';
      } else {
        status.innerHTML = 'Error: something went wrong, but we don\'t know what ... perhaps try again?';
      }
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
      config: { iceServers: [] },
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
        // remember we're vip
        peer.isVIP = true;

        // create button to start the game
        var button = document.createElement("button");
        button.classList.add('buyButton');
        button.innerHTML = "<span>Start the game! (Press this once everyone's connected)</span>";
        document.getElementById('dynamicInterface').appendChild(button);

        button.addEventListener ("click", function() {
          // remove button again
          document.getElementById('dynamicInterface').innerHTML = '';

          console.log("Sent message to start the game");

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
        dynInt.innerHTML = 'GAME OVER!';

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

          var tempString = '<div class="allergyDiv"><span>You\'re allergic to</span>'
          var numAllergies = data.val.length;
          for(var i = 0; i < numAllergies; i++) {
            var ingredientIndex = Math.pow(2, data.val[i]); // convert ingredient index (0-4) to position in spritesheet
            tempString += "<div class='ingSprite' style='background-position:-" + (ingredientIndex*32) + "px 0;'></div>";

            // if this is the second to last iteration, add the word "and"
            // before that, add a comma
            // otherwise add nothing
            if(i == (numAllergies - 2)) {
              tempString += "<span>and</span>"
            } else if( i < (numAllergies-2) ) {
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
          dynInt.innerHTML = '<p>You are at an ingredient store.</p>';

          // convert ingredient to atomic type (one of the five basic ingredients)
          // (this is needed for styling the button with the right coloring)
          var ingredients = ['Dough', 'Tomato', 'Cheese', 'Spice', 'Champignon']
          var atomicType = Math.log2(data.ing);

          // create the button
          var button = document.createElement("button");
          button.classList.add('buyButton');
          button.classList.add("single" + ingredients[atomicType]);
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
          var informMessage = '<p>You are at a table.</p>';
          if(data.isOven) {
            informMessage = '<p>You are at an oven.</p>';
          }

          dynInt.innerHTML = informMessage;

          // content of the table
          var tableContent = data.content;

          // contents of your backpack
          var backpackContent = data.backpack;

          // determine the correct phrasing
          var whatIsIt = 'table';
          if(data.isOven) {
            whatIsIt = 'oven';
          }

          // use this for determining the right class/visual representation for this button
          var ingredients = ['Dough', 'Tomato', 'Cheese', 'Spice', 'Champignon']

          // display our options with nice buttons
          if(tableContent >= 0) {
            // PICK UP current content
            var btn1 = document.createElement("button");
            btn1.classList.add('buyButton');

            // add visual class if this is a single ingredient
            var atomicType = Math.log2(tableContent);
            if((atomicType % 1 === 0)) {
              btn1.classList.add('single' + ingredients[atomicType]);
            }

            btn1.innerHTML = "<span>Pick up</span><div class='ingSprite' style='background-position:-" + (tableContent*32) + "px 0;'></div><span>from the " + whatIsIt + "</span>";
            dynInt.appendChild(btn1);
            btn1.addEventListener ("click", function() {
              // ask computer to pick up this ingredient
              var msg = { 'type': 'table-pickup' }
              peer.send( JSON.stringify(msg) );

              dynInt.innerHTML = '';
            });
          }

          // add something to visually seperate PICKING UP and DROPPING, but only if both are present
          // NOTE: It's IMPORTANT we do this via document.createElement; modifying innerHTML removes any event listeners from buttons we already created
          if(tableContent >= 0 && backpackContent.length > 0) {
            var separator = document.createElement("hr");
            dynInt.appendChild(separator);
          }

          // DROP something from current backpack
          for(var i = 0; i < backpackContent.length; i++) {
            // it's very important we copy the current ingredient here
            // otherwise, at the time the listener below is executed, it would pick the last known value of "i" instead (which would be 5)
            var curIng = backpackContent[i];

            var btn = document.createElement("button");
            btn.classList.add('buyButton');

            // add visual class if this is a single ingredient
            var atomicType = Math.log2(curIng);
            if((atomicType % 1 === 0)) {
              btn.classList.add('single' + ingredients[atomicType]);
            }

            btn.setAttribute('data-ing', curIng); // set ingredient as attribute on the button => most reliable way I know for retrieving it later
            btn.innerHTML = "<span>Drop</span><div class='ingSprite' style='background-position:-" + (curIng*32) + "px 0;'></div><span>at the " + whatIsIt + "</span>";
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
            btn.classList.add('buildingButton');
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
            btn.classList.add('buildingButton');
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


        // player is AT a vehicle
        if(data.type == 'vehicle') {
          var vehicleInt = document.getElementById('vehicleInterface');
          vehicleInt.style.display = 'block';

          // display button for entering
          var btn = document.createElement("button");
          btn.classList.add('buyButton');
          btn.classList.add('vehicleButton');
          btn.innerHTML = "<span>Enter vehicle</span>";
          vehicleInt.appendChild(btn);
          
          // send message to computer that we want to enter the vehicle
          btn.addEventListener ("click", function() {
            var msg = { 'type': 'enter-vehicle' };
            peer.send( JSON.stringify(msg) );

            vehicleInt.innerHTML = '';
          }); 
        }

        // player decides to ENTER a vehicle
        if(data.type == 'enter-vehicle') {
          gm.enterVehicle(peer);
        }

        // player decides to LEAVE the vehicle
        if(data.type == 'leave-vehicle') {
          gm.leaveVehicle(peer);
        }

        // player receives a button so he can leave the vehicle at any time
        // NOTE: It's important that the player keeps overlapping the vehicle while on it, otherwise it triggers the end message
        //       (I would like to turn off the overlapping body, but that is needed for obstruction tests and all ...)
        if(data.type == 'vehicle-active') {
          var vehicleInt = document.getElementById('vehicleInterface');
          vehicleInt.style.display = 'block';

          // display button for leaving the vehicle
          var btn = document.createElement("button");
          btn.classList.add('buyButton');
          btn.classList.add('vehicleButton');
          btn.innerHTML = "<span>Leave vehicle</span>";
          vehicleInt.appendChild(btn);
          
          // send message to computer that we want to leave the vehicle
          btn.addEventListener ("click", function() {
            var msg = { 'type': 'leave-vehicle' };
            peer.send( JSON.stringify(msg) );

            vehicleInt.innerHTML = '';
          }); 
        }

        // if player stopped OVERLAPPING vehicle (but isn't in it/exiting)
        if(data.type == 'vehicle-end') {
          var vehicleInt = document.getElementById('vehicleInterface');
          vehicleInt.style.display = 'none';
          vehicleInt.innerHTML = '';
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
        Phaser.Scene.call(this, { key: 'sceneA', active: true });

        // initialize variables for game start/restart management
        // these are for things that should only be initialized ONCE in the whole lifecycle
        this.beingRestarted = false;
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
       this.load.spritesheet('hourglass', 'assets/hourGlass.png', { frameWidth: 16, frameHeight: 16});

       this.load.spritesheet('vehicles', 'assets/vehicles.png', { frameWidth: 16, frameHeight: 16 });

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

      this.anims.create({
        key: 'idleVehicle',
        frames: this.anims.generateFrameNumbers('vehicles', { start: 0, end: 0 }),
        frameRate: 10,
        repeat: -1
      })

      this.anims.create({
            key: 'drive',
            frames: this.anims.generateFrameNumbers('vehicles', { start: 0, end: 1 }),
            frameRate: 10,
            repeat: -1
        });

      this.anims.create({
        key: 'fullyBaked',
        frames: this.anims.generateFrameNumbers('buildings', { start: 32, end: 36 }),
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

          // ALSO make the border wider at the top, so we have room to display stuff above buildings and tables
          if(x == 0 || x == (this.mapWidth - 1)) {
            value = -1;
          } else if(y <= 2 || y == (this.mapHeight - 1)) {
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
        orderMark.depth = building.depth + 0.01;
        building.myOrderMark = orderMark;

        orderMark.setScale(4,4);

        // add order sprite
        var orderSprite = this.add.sprite(building.x, building.y - this.tileHeight*2.25, 'ingredients');
        orderSprite.setVisible(false);
        orderSprite.setScale(4,4);
        orderSprite.depth = building.depth + 0.01;

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
      // 6) Place some vehicles around the world!
      //
      var numVehicles = 5;
      //this.vehicleBodies = this.physics.add.group();
      this.vehicleBodiesActual = this.physics.add.group();

      for(var i = 0; i < numVehicles; i++) {
        // find a stretch of road
        var x,y;
        var margin = 0;
        do {
          x = Math.floor(Math.random() * (this.mapWidth - margin*2)) + margin;
          y = Math.floor(Math.random() * (this.mapHeight - margin*2)) + margin;
        } while( this.map[x][y] != 3 );

        // create new vehicle
        var newVehicle = this.vehicleBodiesActual.create(x * this.tileWidth, y * this.tileHeight, 'vehicles');
        newVehicle.setSize(newVehicle.displayWidth, newVehicle.displayHeight * (1/4), false);
        newVehicle.body.offset.y = 0.75*newVehicle.displayHeight;

        newVehicle.displayWidth *= 2;
        newVehicle.displayHeight *= 2;
        newVehicle.setOrigin(0.5, 1);

        // make vehicles heavy and make them stop/slow automatically over time
        newVehicle.setMass(100);
        newVehicle.setDrag(0.8); // lower value = slows faster

        // add shadow
        var shadowSprite = this.add.sprite(newVehicle.x, newVehicle.y, 'staticAssets');
        shadowSprite.setFrame(3);
        shadowSprite.setScale(4,4);
        shadowSprite.alpha = 0.2;
        shadowSprite.depth = 0;
        newVehicle.shadowSprite = shadowSprite;

        // create its actual body
        /*
        var vehicleBody = this.vehicleBodiesActual.create(newVehicle.x, newVehicle.y, null);
        vehicleBody.setVisible(false);
        vehicleBody.displayWidth = newVehicle.displayWidth;
        vehicleBody.displayHeight = newVehicle.displayHeight * (1/4);
        */
      }

      // collide vehicles with EVERYTHING, just like players
      this.physics.add.collider(this.vehicleBodiesActual, this.boundBodies);
      this.physics.add.collider(this.vehicleBodiesActual, this.wallBodiesActual);
      this.physics.add.collider(this.vehicleBodiesActual);
      this.physics.add.collider(this.vehicleBodiesActual, this.natureBodiesActual);
      this.physics.add.collider(this.vehicleBodiesActual, this.tableBodiesActual);
      this.physics.add.collider(this.vehicleBodiesActual, this.buildingBodiesActual);

      // finally, collide vehicles with players, and provide a callback
      this.physics.add.overlap(this.playerBodies, this.vehicleBodiesActual, this.playerAtVehicle, null, this);

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

      // currently, a round lasts 6 minutes
      this.timeLeft = 60 * 6 + 1;
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
      // that is far enough from the WALLS and from EXISTING workspaces
      var x,y;
      var margin = 3;
      do {
        x = Math.floor(Math.random() * (this.mapWidth - margin*2)) + margin;
        y = Math.floor(Math.random() * (this.mapHeight - margin*2)) + margin;
      } while( !this.mapCheck(x, y, 10, this.existingWorkspaces) );

      //
      // 1) Create random path of length N, without loops or self-intersections
      //    (this is our "walking path" through the kitchen)
      //
      var randomLength = Math.floor(Math.random() * 5) + 5;
      var path = this.findPathOfLength(randomLength, [x,y]);
      var roomFloor = [];

      // once we've found our path, create the matching room floors
      for(var i = 0; i < path.length; i++) {
        roomFloor.push(path[i]);
        this.createRoomFloor(path[i][0], path[i][1]);
      }

      //
      // 2) Add roads to start and end point of this path
      //
      this.extendRoad(path[0][0], path[0][1]);
      this.extendRoad(path[randomLength-1][0], path[randomLength-1][1]);

      //
      // 3) Randomly place AxB rectangles across the path
      //    (until we reach a desired minimum of cells in the workspace)
      //
      var minCells = Math.floor(Math.random()*10) + 20;
      while(roomFloor.length < minCells) {
        // grab random vertex from path
        var p = path[ Math.floor(Math.random() * randomLength) ];

        // determine random rectangle size
        var width = Math.floor(Math.random()*2) + 2;
        var height = Math.floor(Math.random()*2) + 2;

        // place it somewhere around the vertex
        var offsetX = Math.floor(Math.random()*width);
        var offsetY = Math.floor(Math.random()*height);

        // simply go in a rectangle around the point + offset
        // if a cell is already occupied, just ignore it
        // otherwise, place a room floor
        for(var x = 0; x < width; x++) {
          for(var y = 0; y < height; y++) {
            var newP = [ p[0] + x - offsetX, p[1] + y - offsetY ];

            // out of bounds
            if(newP[0] < 0 || newP[0] > this.mapWidth || newP[1] < 0 || newP[1] > this.mapHeight) {
              continue;
            }

            // cell already occupied
            if(this.map[ newP[0] ][ newP[1] ] != 0) {
              continue;
            }

            this.createRoomFloor(newP[0], newP[1]);
            roomFloor.push(newP);
          }
        }
      }

      //
      // 4) Go through all blocks to determine the walls (+ get possible table spots)
      //
      for(var i = 0; i < roomFloor.length; i++) {
        var p = roomFloor[i];

        // check their neighbours
        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        for(var d = 3; d >= 0; d--) {
          // each neighbour that EXISTS, ignore it (can't place a wall there!)
          var pX = p[0] + dirs[d][0], pY = p[1] + dirs[d][1];
          if(this.map[pX][pY] == 5) {
            continue;
          }

          if(this.map[pX][pY] == 3) {
            // if it's the start/end point of the path, make sure we have OPENINGS to the road
            if(i == 0 || i == (randomLength - 1)) {
              continue

            // otherwise, create these openings randomly
            } else {
              if(Math.random() <= 0.25) {
                continue;
              }
            }
          }

          

          // otherwise place a wall at this position (pX, pY) and this direction (d)
          this.placeWall(pX, pY, d)
        }
      }

      //
      // 5) Place X amount of tables and Y amount of ovens, ignoring invalid spaces (such as the walking path)
      // 

      // remove the first "pathLength" entries of the roomFloor, as they are the path (on which we may not place anything)
      roomFloor.splice(0, randomLength);

      var numTables = 6;
      for(var i = 0; i < numTables; i++) {
        // grab a random table spot; remove it from complete array of table spots
        var p = roomFloor.splice(Math.floor(Math.random() * roomFloor.length), 1)[0];

        // create table or oven there
        var isOven = (i % 2 == 1); // all odd numbers are ovens, rest are default tables
        var table = this.createTable(p[0], p[1], isOven);
      }


      //
      // finally, add to existing workspaces
      //
      this.existingWorkspaces.push({ 'x': x, 'y': y });
    },

    findPathOfLength(length, startPoint) {
      // mark start point as visited
      this.map[ startPoint[0] ][ startPoint[1] ] = 5;

      // check for a path in each direction
      var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
      dirs = this.shuffle(dirs);
      var path = [];

      for(var i = 0; i < dirs.length; i++) {
        // try to extend the path in this direction
        path = this.extendPath(length, startPoint, dirs[i]);

        // if no such path exists, continue
        if(path == null) {
          continue;
        }

        // otherwise, return the path
        path.push(startPoint);
        return path;
      }

      // if nothing has been returned by now, no path exists!
      return null;
    },

    extendPath(remainingLength, startPoint, curDir) {
      // Proceed in the given direction to find our next point.
      var point = [];    
      point[0] = startPoint[0] + curDir[0];
      point[1] = startPoint[1] + curDir[1];

      // if this point is already marked as something else (perhaps world border, or another path, etc.), ignore it
      if(this.map[ point[0] ][ point[1] ] != 0) {
        return null;
      }

      // avoid touching/crossing existing elements of the path (forward, left and right dirs)
      var dirs = [curDir, [curDir[1], -curDir[0]], [-curDir[1], curDir[0]] ];
      for(var i = 0; i < dirs.length; i++) {
        if( this.map[ point[0] + dirs[i][0] ][ point[1] + dirs[i][1] ] == 5 ) {
          return null;
        }
      }

      // mark point as visited
      this.map[ point[0] ][ point[1] ] = 5;

      // if we have reached our desired length, bubble back up!   
      if(remainingLength <= 0) {
        // return a new PATH, starting at POINT
        return [ point ];
      }

      // otherwise, keep searching through forward/left/right directions
      dirs = this.shuffle(dirs);
      var path = [];
      for(var i = 0; i < dirs.length; i++) {
        path = this.extendPath(remainingLength - 1, point, dirs[i]);
        if(path == null) { continue; }

        // extend that path (found above) to include this point
        path.push(point);
        return path;
      }

      // No path through this point panned out, undo our attempt
      this.map[ point[0] ][ point[1] ] = 0;
      return null;
    },

    placeWall(pX, pY, d) {
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

    },

    createTable(x, y, isOven = false) {
      // create the table body with right size and all
      var table = this.tableBodies.create(x * this.tileWidth, y * this.tileHeight, 'buildings');

      // determine table type (regular or oven) => random for now (TO DO?)
      // frames: 28 = regular table, 29 = oven
      var tableType = 'regular';
      table.setFrame(28);
      if(isOven) { 
        tableType = 'oven'; 
        table.setFrame(29);
      }
      table.myType = tableType;

      table.y += 0.5*this.tileHeight;
      table.setOrigin(0.5, 1);
      table.setScale(4,4).refreshBody(); 
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
      table.myContentSprite.depth = table.depth + 0.01;

      // if it's an oven, add the HEAT meter 
      // (it's display to the left, next to the order sprite)
      var tweenTargets = [table.myContentSprite];
      if(tableType == 'oven') {
        var heatMeter = this.add.sprite(table.myContentSprite.x + 0.5*this.tileWidth, table.myContentSprite.y, 'buildings');
        
        // frames 37-42 are for the heat meter => 37 = cold, 42 = burned
        heatMeter.setFrame(37);
        heatMeter.setScale(2,2);
        heatMeter.setVisible(false);
        heatMeter.depth = table.myContentSprite.depth + 0.05;

        table.myHeatMeter = heatMeter;

        tweenTargets = [table.myContentSprite, table.myHeatMeter];
      }

      // animate the order sprite (just softly go up and down, repeat infinitely)
      // also animate the heat meter, if it exists
      var tween = this.tweens.add({
          targets: tweenTargets,
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
      this.money = 25;
      this.timeLeft = 500;

      // copy players to backup variable; clear the actual array
      this.scene.get('gameOver').oldPlayers = this.players;
      this.players = [];

      // restart this whole scene
      this.scene.restart();

      // NOTE: now, at the "create" function, it should automatically add all the players and call startGame()
    },

    startGame() {
      var numPlayers = this.players.length;

      console.log("START GAAMMEEE");

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

      console.log("RECEIVED MESSAGE TO START THE GAME");

      // update money to match player count
      // (5 extra bucks per person, just to make things quicker/easier at the start)
      this.updateMoney(numPlayers*5, null);

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
      // grab a random building, ignoring any building occupied with other stuff
      // (either they're already ordering/waiting, or it's an ingredient location, or something like that)
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
        // otherwise, keep track of the currently outstanding orders (which is both ORDERING and WAITING)
        // NOTE: randomly, the maximum number of orders might increase to be ONE more than the player count (for extra challenge!)
        var maxOrders = this.players.length;
        maxOrders += Math.floor(Math.random());

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
        // turn on some animations and plan the definite fail event

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

    playerAtVehicle(player, vehicle) {
      // NOTE: This one works via OVERLAP, not COLLISION
      // so, player already contains the sprite + overlap body, not the actualBody

      // if we're already overlapping a vehicle OR inside a vehicle, do not overlap/collide with vehicles
      if(player.currentVehicle != null || player.myVehicle != null) {
        return;
      }

      // if this vehicle already has someone inside, also ignore it
      if(vehicle.myCurPlayer >= 0) {
        return;
      }

      player.currentVehicle = vehicle;

      this.sendVehicleMessage(player, vehicle);
    },

    sendVehicleMessage(player, vehicle) {
      // TO DO: Perhaps inform all other players at the same vehicle?
      var msg = { 'type': 'vehicle' };
      player.myPeer.send( JSON.stringify(msg )); 
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
        var msg = { 'type': 'table', 'isOven': (table.myType == 'oven'),'content': table.myContent, 'backpack': p.myIngredients };
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
      var t = player.currentTable;
      var params = t.heatVal;
      var result = this.updateIngredient(peer, ingredientType, 1, params);

      if(!result) {
        this.ingameFeedback(player, 'No space in backpack!');
        console.log("Error: no space in backpack to pick up ingredient from table");
        this.sendTableMessage(player, t);
        return;
      }

      // update the table
      t.myContent = -1;
      t.myContentSprite.setVisible(false);
      
      if(t.myType == 'oven') {
        t.myHeatMeter.setVisible(false);
      }

      // send response back (simply an UPDATE on the table status)
      this.sendTableMessage(player, t);
    },

    hasAllergy(player, ing) {
      // decompose the ingredient
      var decIng = this.decomposeIngredient(ing);

      // check each existing ingredient against the player allergies
      var myAll = player.myAllergies;
      var isAllergic = false;
      var numElementsInIngredient = 0;
      for(var i = 0; i < decIng.length; i++) {
        // if the ingredient doesn't exist, ignore it
        if(decIng[i] == 0) { continue; }

        numElementsInIngredient++;

        // if it does, check all the player's allergies
        // if this number is in there, we are allergic
        for(var a = 0; a < myAll.length; a++) {
          if(i == myAll[a]) {
            isAllergic = true;
          }
        }
      }

      // you can never be allergic for combined pizzas when in 1-3 player mode
      // (otherwise you get a lot of situations where you just can not possibly deliver something)
      if(this.players.length <= 3 && numElementsInIngredient > 1) {
        isAllergic = false;
      }

      // if all checks fail, we are NOT allergic
      return isAllergic;
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

      // if we're at an OVEN, but there's already something INSIDE the oven
      // do NOT allow dropping something new onto it
      var t = player.currentTable;
      if(t.myType == 'oven' && t.myContent != -1) {
        this.ingameFeedback(player, 'Oven is already full!');
        console.log("Error: tried to combine ingredients on an oven; you can only combine at a table");
        return;
      }

      // if we're at an OVEN and trying to drop a single INGREDIENT (which is not dough), repel it
      var powerOfTwo = ( (Math.log(ing)/Math.log(2)) % 1 === 0 );
      if(t.myType == 'oven' && ing > 1 && powerOfTwo) {
        this.ingameFeedback(player, 'Can\'t bake single ingredient by itself!');
        console.log("Error: tried to put a single topping into the oven, without dough");
        return;
      }

      // Combine ingredients!
      var newContent = this.combineIngredients(t.myContent, ing);
      if(newContent == -1) {
        this.ingameFeedback(player, 'Can\'t combine ingredients!');
        console.log("Error: invalid combination of ingredients!");
        this.sendTableMessage(player, t);
        return;
      }

      // get heat value from player, copy this to the table
      // NOTE/TO DO: Perhaps in the future I might want to have multiple parameters per pizza (should rename this variable and turn into object with "heat" property)
      var heatVal = this.getIngredientParams(player, ing);
      t.heatVal = heatVal;

      // if it's an oven, take over the ingredient's heat value, update markers
      if(t.myType == 'oven') {
        this.updateHeat(t, 0);
      }

      // update the table (content + sprite)
      t.myContent = newContent;
      t.myContentSprite.setVisible(true);
      t.myContentSprite.setFrame(newContent);

      // update player backpack
      this.updateIngredient(peer, ing, -1);

      // send response back (an UPDATE on table/backpack status)
      this.sendTableMessage(player, t);
    },

    // if obj is the only parameter, we're looking at a table
    // if the index ('ind') is specified, we're looking at an ingredient in a player's backpack
    updateHeat(obj, dh, ind = -1) {
      // the value "dh" is simply the timestep from this update
      // we still need to multiply this with how fast stuff warms or cools
      // (and convert milliseconds to seconds, because our heat values go from 0 to 1, not 0 to 1000)
      var heatDuration = (1.0/1000) * (1.0/25); // 25 seconds to heat something fully (from 0->1)
      var coolDuration = (1.0/1000) * (1.0/120); // 120 seconds to cool something fully (from 1->0) (why so long? because if it drops below 7/9, it's already useless, so keep it up)
      if(dh > 0) {
        dh *= heatDuration;
      } else {
        dh *= coolDuration;
      }

      // update heat value + grab the new value
      var heatVal = 0;
      if(ind == -1) {
        obj.heatVal += dh;
        heatVal = obj.heatVal;
      } else {
        obj.myIngredientParams[ind] += dh;
        heatVal = obj.myIngredientParams[ind];
      }

      // if the original heat value is 1, it is BURNED and can never cool down
      var isBurned = ((heatVal - dh) >= 1);

      // clamp between 0 and 1
      heatVal = Math.min( Math.max(0, heatVal), 1);

      //
      // Check if something should happen based on new heat
      //

      // if the pizza was already burned, or it is burned now, tint the sprite (make it blackened)
      if(isBurned || heatVal >= 1) {
        heatVal = 1;

        if(ind == -1) {
          obj.heatVal = 1.0;

          obj.myContentSprite.setFrame(0);
          obj.myContent = 0;
        } else {
          obj.myIngredientParams[ind] = 1.0;

          obj.backpackSprites[ind].setFrame(0);
          obj.myIngredients[ind] = 0;
        }
      }

      //
      // update visuals
      //


      // heat goes from 0 to 1; 0 is too cold, above (7/9) ~ 0.78 is okay, 1 is burned (it caps at 1)
      // the steps it takes (2/9, or 1/9) depends on the meter (see sprite), the last step is immediate burning, that's why it has no length
      var heatToFrame = 37;
      if(heatVal < (3/9)) {
        heatToFrame = 37
      } else if(heatVal < (5/9)) {
        heatToFrame = 38
      } else if(heatVal < (7/9)) {
        heatToFrame = 39
      } else if(heatVal < (8/9)) {
        heatToFrame = 40
      } else if(heatVal < (9/9)) {
        heatToFrame = 41
      } else {
        heatToFrame = 42
      }

      // finally, set the values and frames correctly
      if(ind == -1) {
        if(obj.myType == 'oven') {
          obj.myHeatMeter.setVisible(true);
          obj.myHeatMeter.setFrame(heatToFrame);
        }
      } else {
        // update heat stuff in player backpack (if heat above (7/9), it's baked, otherwise it's not)
        if(heatVal >= (7/9)) {
          obj.backpackParamSprites[ind].setVisible(true);
          obj.backpackParamSprites[ind].anims.play('fullyBaked', true);
        } else {
          obj.backpackParamSprites[ind].setVisible(false);
        }
      }
    },

    playerAtArea: function(player, area) {
      // if this player does NOT have an assigned area yet, and this area is NOT currently being used
      if(player.currentArea != null || area.beingUsed) {
        return;
      }

      // if this building does nothing special, we do nothing special
      if(area.myBuilding.myStatus == 'none') {
        return;
      }

      // set the current area
      // (even if we can't deliver, it's useful to do this: it means we still emit one signal upon entering and one upon leaving)
      player.currentArea = area;

      if(area.myBuilding.myStatus == 'waiting') {
        var weHaveIt = false;
        var weHaveUncooked = false;
        for(var i = 0; i < player.myIngredients.length; i++) {
          if(player.myIngredients[i] == area.myBuilding.myOrder) {
            // yay, we have the right thing
            weHaveIt = true;

            // it's the right ingredient, BUT it hasn't baked long enough!
            if(player.myIngredientParams[i] < (7/9)) {
              weHaveUncooked = true;
              weHaveIt = false;
              continue;
            }

            // if everything checks out (ingredient + baked long enough), break here
            if(weHaveIt) {
              break;
            }
            
          }
        }

        if(!weHaveIt) {
          this.ingameFeedback(player, 'Delivery does not match your backpack');
          console.log("Error: Nah, you don't have what should be delivered here");
          return;
        }

        if(weHaveUncooked) {
          this.ingameFeedback(player, 'Sorry, the pizza needs to be hotter!');
          console.log("Error: tried to deliver a pizza that wasn't baked enough");
          return;
        }
      }

      // otherwise, send an area message with the building status included
      var msg = { 'type': 'area', 'status': area.myBuilding.myStatus };
      player.myPeer.send( JSON.stringify(msg) );

      area.beingUsed = true;
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

      // plan the delivery ran out event
      // Time depends on complexity of the order => 20 seconds per ingredient, 30 seconds for baking
      var deliveryTime = b.myOrderIngredientNum * 20 * 1000 + 30
      this.addEventToQueue('almostFailed', deliveryTime, { 'building': b, 'id': b.myOrderID, 'statusCheck': 'waiting' });

      // remove exclamation mark
      b.myOrderMark.setVisible(false);
      b.myOrderMark.anims.stop();

      // Also change the visual state to match (show the current wanted pizza type)
      b.myOrderSprite.setVisible(true);
      b.myOrderSprite.setFrame(b.myOrder);

      // animate this sprite (just softly go up and down, repeat infinitely)
      var tween = this.tweens.add({
          targets: b.myOrderSprite,
          y: { from: b.myOrderSprite.y, to: b.myOrderSprite.y - 16 },
          ease: 'Linear',       // 'Cubic', 'Elastic', 'Bounce', 'Back'
          duration: 1000,
          repeat: -1,
          yoyo: true
      });

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

      // remove this order from the accumulative total
      this.curOutstandingOrders--;

      // reset status to none (we have our thing, stop whining about it)
      b.myStatus = 'none';
    },

    enterVehicle: function(peer) {
      var player = this.players[peer.playerGameIndex];

      // check if player and vehicle exist
      if(player == undefined || player.currentVehicle == null) {
        this.ingameFeedback(player, 'No vehicle to enter!');
        console.log("Error: no player or no vehicle to enter");
        return;
      }

      // remember we have a player (on the vehicle)
      player.currentVehicle.myCurPlayer = peer.playerGameIndex;

      // attach player to vehicle permanently
      player.myVehicle = player.currentVehicle;
      player.currentVehicle = null;

      // disable player body (otherwise we keep colliding/overlapping all sorts of stuff)
      player.actualBody.enable = false;
      player.body.enable = false;

      // send a button to the phone of the player in the vehicle
      // (if he presses it, he leaves the vehicle)
      var msg = { 'type': 'vehicle-active' };
      peer.send( JSON.stringify(msg) );
    },

    leaveVehicle: function(peer) {
      var player = this.players[peer.playerGameIndex];

      // check if player and vehicle exist
      if(player == undefined || player.myVehicle == null) {
        this.ingameFeedback(player, 'No vehicle to exit!');
        console.log("Error: no player or no vehicle to exit");
        return;
      }

      // remember we left the vehicle (on the vehicle)
      player.myVehicle.myCurPlayer = -1;

      // remove vehicle from player
      player.myVehicle = null;

      // enable body again
      player.actualBody.enable = true;
      player.body.enable = true;
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

      // subtract money (price for buying)
      var result = this.updateMoney(-buyInfo.price, player);
      if(!result) {
        return;
      }

      // add ingredient(s) to the player
      var result = this.updateIngredient(peer, buyInfo.ing, 1);

      // if the result is false, it means we don't have the space for this ingredient
      if(!result) {
        this.ingameFeedback(player, 'No space in backpack!');
        console.log("Error: trying to buy an ingredient you don't have space for (in your backpack");
        return;
      }

      
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

    getIngredientParams: function(player, ing) {
      for(var i = (player.myIngredients.length-1); i >= 0; i--) {
        if(player.myIngredients[i] == ing) {
          return player.myIngredientParams[i];
        }
      }
    },

    updateIngredient: function(peer, ing, val, params = 0) {
      // update actual value
      var player = this.players[peer.playerGameIndex];

      // check if we have space for this ingredient; if not, repulse it
      if((player.myIngredients.length+val) > player.backpackSize) {
        return false;
      }

      // if it's an ADDITION, well, simply add it
      if(val > 0) {
        for(var i = 0; i < val; i++) {
          player.myIngredients.push(ing);

          // Take over the parameters from whatever we picked up
          player.myIngredientParams.push(params);
        }

      // otherwise, if we are REMOVING/USING an ingredient ...
      } else {
        // go through ingredients (in reverse order)
        // remove matching values until we've removed enough of them
        for(var i = (player.myIngredients.length-1); i >= 0; i--) {
          if(player.myIngredients[i] == ing) {
            player.myIngredients.splice(i, 1);
            player.myIngredientParams.splice(i, 1);
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
          var heatVal = player.myIngredientParams[i];

          player.backpackSprites[i].setVisible(true);
          player.backpackSprites[i].setFrame(player.myIngredients[i]);

          // if heat is above 0.8, show the sprite and animate it
          if(heatVal >= (7/9)) {
            player.backpackParamSprites[i].setVisible(true);
            player.backpackParamSprites[i].anims.play('fullyBaked', true);
          }

        // otherwise, hide it
        } else {
          player.backpackSprites[i].setVisible(false);
          player.backpackParamSprites[i].setVisible(false);
          player.backpackParamSprites[i].anims.stop();
        }
      }

      // remember how much of our backpack is filled
      player.backpackSizeFilled = player.myIngredients.length;

      // yes, we were succesful!
      return true;
    },

    update: function(time, dt) {
      // check the event queue
      // (which should automatically handle events that should happen)
      this.checkEventQueue(time);

      // go through all tables (for updating heat values)
      var tables = this.tableBodies.getChildren();
      for(var i = 0; i < tables.length; i++) {
        var t = tables[i];

        // ignore anything that is empty
        if(t.myContent == -1) {
          continue;
        }

        // ovens INCREASE heat
        if(t.myType == 'oven') {
          this.updateHeat(t, dt);

        // tables DECREASE heat
        } else {
          this.updateHeat(t, -dt);
        }
      }

      // go through all players
      for(var i = 0; i < this.players.length; i++) {
        var p = this.players[i];

        // if we ARE in a vehicle, update the position to match the vehicle
        // (also update depth + shadow sprite of player)
        if(p.myVehicle != null) {
          p.actualBody.x = p.myVehicle.x;
          p.actualBody.y = p.myVehicle.y + 0.65*p.myVehicle.displayHeight;

          p.myVehicle.depth = p.myVehicle.y;
          p.depth = p.myVehicle.depth - 1;
          p.shadowSprite.setVisible(false);

          p.myVehicle.shadowSprite.x = p.myVehicle.x;
          p.myVehicle.shadowSprite.y = p.myVehicle.y;
        } else {
          p.shadowSprite.setVisible(true);
        }

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

          // remember: param sprites have size 8x11, whilst ingredients are 8x8, so do this to make sure they align properly
          p.backpackParamSprites[b].x = s.x;
          p.backpackParamSprites[b].y = s.y - (3/8)*0.5*this.tileHeight;
          p.backpackParamSprites[b].depth = s.depth - 0.01;
        }

        // slowly cool down anything in our backpack
        for(var b = 0; b < p.myIngredients.length; b++) {
          this.updateHeat(p, -dt, b);
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
          var tp = p.currentTable.myType;

          // highlight table
          p.currentTable.setFrame(30);
          if(tp == 'oven') {
            p.currentTable.setFrame(31);
          }
          
          if(!this.checkOverlap(p, p.currentTable)) {
            // reset table sprite
            p.currentTable.setFrame(28);
            if(tp == 'oven') {
              p.currentTable.setFrame(29);
            }

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

        // check if we've STOPPED overlapping a vehicle
        if(p.currentVehicle != null) {
          if(!this.checkOverlap(p, p.currentVehicle)) {
            p.currentVehicle = null;

            var msg = { 'type': 'vehicle-end' }
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

      var x,y
      do {
        x = Math.floor(Math.random() * this.mapWidth);
        y = Math.floor(Math.random() * this.mapHeight);
      } while( this.map[x][y] != 0);

      var randX = x * this.tileWidth, randY = y * this.tileHeight;

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

      // a high value is way too chaotic and uncontrollable
      // a very low value, however, might just help bounce the player off of annoying walls
      actualBody.setBounce(0.1, 0.1);
      

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
      newPlayer.myIngredients = []; // the actual ingredients/pizzas we have
      newPlayer.myIngredientParams = []; // any status modifiers, such as heat value

      newPlayer.currentTable = null;

      newPlayer.currentArea = null;

      newPlayer.obstructingObjects = [];

      newPlayer.myAllergies = [];

      newPlayer.currentVehicle = null;
      newPlayer.myVehicle = null;

      //
      // ingredients/backpack container
      //
      newPlayer.backpack = this.add.group();
      newPlayer.backpack.setOrigin(0.5, 0.5);

      newPlayer.backpackSize = 3;
      newPlayer.backpackSprites = [];
      newPlayer.backpackParamSprites = [];
      newPlayer.backpackSizeFilled = 0;
      for(var i = 0; i < newPlayer.backpackSize; i++) {
        // regular ingredient sprite
        var tempS = newPlayer.backpack.create(i*32, 0, 'ingredients');

        tempS.displayHeight = tempS.displayWidth = 32;
        tempS.setVisible(false);

        newPlayer.backpackSprites.push(tempS);

        // parameter sprites (such as: heat value)
        tempS = newPlayer.backpack.create(i*32, 0, 'buildings');

        tempS.setScale(4,4);
        tempS.setVisible(false);

        newPlayer.backpackParamSprites.push(tempS);
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

      var objToMove = this.players[peer.playerGameIndex];
      var objsToAnimate = [objToMove];
      var speed = 120;
      var animNames = ['run', 'drive'];
      var animNamesIdle = ['idle', 'idleVehicle'];

      // if the player has a vehicle attached, use that instead
      if(objToMove.myVehicle != null) {
        objToMove = objToMove.myVehicle;
        objsToAnimate.push(objToMove);

        // move twice as fast!
        speed *= 2;
      } else {
        objToMove = objToMove.actualBody;
      }

      // just move the player according to velocity vector
      // var curVel = player.velocity
      objToMove.setVelocity(vec[0] * speed, vec[1] * speed);

      // animate all things that need animating
      // (only the player, or player + vehicle, stuff like that)
      for(var i = 0; i < objsToAnimate.length; i++) {
        var obj = objsToAnimate[i];

        // if we should stop, play idle animation
        if(vec[0] == 0 && vec[1] == 0) {
          obj.anims.play(animNamesIdle[i], true);

        // otherwise, play run animation
        } else {
          obj.anims.play(animNames[i], true);
        }

        // flip properly (on the horizontal axis) if moving the other way
        if(vec[0] < 0) {
          obj.flipX = true;
        } else if(vec[0] > 0) {
          obj.flipX = false;
        }
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
      this.oldPlayers = [];

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

      this.bodyText.text += '\n\n\nWant to play again? The VIP has a button to restart.'
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

