export function peerComputer(peer, connection, data) {
	// grab reference to game scene
    var gm = null;
    if(GAME != null) { gm = GAME.scene.keys.mainGame; }

    if(data.type == 'msg') {
      // add message to the message stream
      document.getElementById('messageStream').innerHTML += "<p>" + data.value + "</p>";
      return;
    }

    //
    // Game state management (start/restart)
    //

    if(data.type == 'start-game') {
      // inform the SERVER that this game has started, so only reconnects are allowed
      var msg = { 'action': 'startGame' };
      connection.send( JSON.stringify(msg) );

      // set difficulty and start the game
      gm.difficulty = data.difficulty;
      gm.startGame();

      return;
    }

    if(data.type == 'restart-game') {
      gm.difficulty = data.difficulty;
      gm.restartGame();

      return;
    }

    //
    // Misc (moving + buying)
    //

    // player has requested a MOVE
	if(data.type == 'move') {
		gm.updatePlayer(peer, data.vec);
		return;
	}

	// player has requested to BUY an ingredient
	if(data.type == 'buy') {
		gm.buyAction(peer);
		return;
	}

	//
	// Table (pickup + drop)
	//

	// pick up ingredient from table
	if(data.type == 'table-pickup') {
		gm.pickupIngredient(peer);
		return;
	}

	// drop (given) ingredient on table
	if(data.type == 'table-drop') {
		gm.dropIngredient(peer, data.ing);
		return;
	} 

	//
	// Orders (area + taking/delivering)
	//

	// player is at an order area, and has chosen to TAKE the order
	// (this message is always received on the COMPUTER side)
	if(data.type == 'take-order') {
		gm.takeOrder(peer);
		return;
	}

	// player decided to deliver an order
	if(data.type == 'deliver-order') {
		gm.deliverOrder(peer);
		return;
	}

	//
	// Vehicles
	//

	// player decides to ENTER a vehicle
	if(data.type == 'enter-vehicle') {
		gm.enterVehicle(peer);
		return;
	}

	// player decides to LEAVE the vehicle
	if(data.type == 'leave-vehicle') {
		gm.leaveVehicle(peer);
		return;
	}
}