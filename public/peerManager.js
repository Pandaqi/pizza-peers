import { updateStatus } from './updateStatus.js';
import { startController } from './controllerManager.js';

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

  // remember we're not connected yet
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

    // grab reference to game scene
    var gm = null;
    if(GAME != null) { gm = GAME.scene.keys.mainGame; }

    if(data.type == 'msg') {
      // add message to the message stream
      document.getElementById('messageStream').innerHTML += "<p>" + data.value + "</p>";
    }

    // the first mobile phone to connect, receives this lobby event
    // it creates a button that, once clicked, actually starts the game
    if(data.type == 'lobby' && data.ind == 0) {
      // remember we're vip
      peer.isVIP = true;

      // create a form for choosing difficulty
      document.getElementById('dynamicInterface').innerHTML = '\
        <label for="difficultyForm">Difficulty: </label>\
        <input type="radio" name="difficultyForm" value="0" checked="checked">Amateur</input>\
        <input type="radio" name="difficultyForm" value="1">Cook</input>\
        <input type="radio" name="difficultyForm" value="2">Chef</input>\
        <input type="radio" name="difficultyForm" value="3">Master Chef</input>';

      // create button to start the game
      var button = document.createElement("button");
      button.classList.add('buyButton');
      button.innerHTML = "<span>Start the game! (Press this once everyone's connected)</span>";
      document.getElementById('dynamicInterface').appendChild(button);

      button.addEventListener ("click", function() {
        // get value from the form
        var radios = document.getElementsByName('difficultyForm');
        var difficulty = 0;

        for (var i = 0, length = radios.length; i < length; i++) {
          if (radios[i].checked) {
            difficulty = parseInt(radios[i].value);
            break;
          }
        }

        // remove button again
        document.getElementById('dynamicInterface').innerHTML = '';

        console.log("Sent message to start the game");

        // send message to start the game
        var msg = { 'type': 'start-game', 'difficulty': difficulty }
        peer.send( JSON.stringify(msg) );
      });
    }

    if(data.type == 'start-game') {
      // inform the SERVER that this game has started, so only reconnects are allowed
      var msg = { 'action': 'startGame' };
      connection.send( JSON.stringify(msg) );

      // set difficulty and start the game
      gm.difficulty = data.difficulty;
      gm.startGame();
    }

    // the COMPUTER receives this event
    if(data.type == 'restart-game') {
      gm.difficulty = data.difficulty;
      gm.restartGame();
    }

    // the PLAYER receives this event 
    if(data.type == 'game-restart') {
      document.getElementById('dynamicInterface').innerHTML = 'Game restarted, have fun!';

      peer.gameOver = false;
    }

    if(data.type == 'game-end') {
      // simply clear all other interfaces
      updateStatus('');
      document.getElementById('vehicleInterface').innerHTML = '';
      document.getElementById('allergyInterface').innerHTML = '';

      // remember we're in the "gameOver" state
      // why? so we can ignore any messages that come in after us
      peer.gameOver = true;

      var dynInt = document.getElementById('dynamicInterface');
      dynInt.innerHTML = '<p style="text-align:center;">GAME OVER!</p>';

      // if we are the vip, get the button to restart
      if(peer.isVIP) {
        // create a form for choosing difficulty
        dynInt.innerHTML += '\
          <label for="difficultyForm">Difficulty: </label>\
          <input type="radio" name="difficultyForm" value="0" checked="checked">Amateur</input>\
          <input type="radio" name="difficultyForm" value="1">Cook</input>\
          <input type="radio" name="difficultyForm" value="2">Chef</input>\
          <input type="radio" name="difficultyForm" value="3">Master Chef</input>';

        var button = document.createElement("button");
        button.classList.add('buyButton');
        button.innerHTML = "<span>Play again?</span>";
        dynInt.appendChild(button);

        button.addEventListener ("click", function() {
          // get value from the form
          var radios = document.getElementsByName('difficultyForm');
          var difficulty = 0;

          for (var i = 0, length = radios.length; i < length; i++) {
            if (radios[i].checked) {
              difficulty = parseInt(radios[i].value);
              break;
            }
          }

          // remove button again
          dynInt.innerHTML = '';

          // send message to start the game
          var msg = { 'type': 'restart-game', 'difficulty': difficulty }
          peer.send( JSON.stringify(msg) );
        });
      }

      // TO DO: Also give a button to "destroy" the game, makes it easy to remove from the server as well
      // (Alternatively, when you close the computer screen, automatically send one final signal to the server that it should remove the game)
    }

    if(peer.isConnected && !peer.gameOver) {
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

  return peer;
}