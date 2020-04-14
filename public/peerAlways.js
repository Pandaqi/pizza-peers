function createDifficultyForm() {
	return '\
	  <label for="difficultyForm">Difficulty: </label>\
	  <input type="radio" name="difficultyForm" value="0" checked="checked">Amateur</input>\
	  <input type="radio" name="difficultyForm" value="1">Cook</input>\
	  <input type="radio" name="difficultyForm" value="2">Chef</input>\
	  <input type="radio" name="difficultyForm" value="3">Master Chef</input>';
}

export function peerAlways(peer, connection, data) {
	// when mobile phones first connect ,they receive this lobby event
    // for the FIRST PLAYER (the VIP) it creates a button that, once clicked, actually starts the game
    if(data.type == 'lobby' && data.ind == 0) {
      // remember we're vip
      peer.isVIP = true;

      // create a form for choosing difficulty
      document.getElementById('dynamicInterface').innerHTML = createDifficultyForm();

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
        dynInt.innerHTML += createDifficultyForm();

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
    }
}