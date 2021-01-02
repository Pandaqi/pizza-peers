export function peerController(peer, connection, data) {
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

      return;
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

      return;
  	}

  	// player has moved away from an INGREDIENT location (overlapExit)
  	if(data.type == 'ing-end') {
  		dynInt.innerHTML = '';
      return;
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

        return;
    }

    // stop standing near table
  	if(data.type == 'table-end') {
  		dynInt.innerHTML = '';
      return;
  	}

	  // player is at an ORDER area
    if(data.type == 'area') {
        dynInt.innerHTML = 'You rang the doorbell.';

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

      return;
    }

    // player LEFT an order area
    if(data.type == 'area-end') {
        dynInt.innerHTML = '';
        return;
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

      return;
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

      return;
    }

    // if player stopped OVERLAPPING vehicle (but isn't in it/exiting)
    if(data.type == 'vehicle-end') {
        var vehicleInt = document.getElementById('vehicleInterface');
        vehicleInt.style.display = 'none';
        vehicleInt.innerHTML = '';

        return;
    }
}