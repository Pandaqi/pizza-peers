<?php require_once('ledatabanko.php'); ?>

<?php

// get type (computer who started the game, or controller who is trying to connect to a game?)
$type = $_GET['type'];

// get room
$room = $_GET['room'];

?>

<html>
  <body>
    <style>
      #outgoing {
        width: 600px;
        word-wrap: break-word;
        white-space: normal;
      }
    </style>
    
    <form id="signaling">
      <textarea id="incoming"></textarea>
      <button type="submit">submit</button>
    </form>

    <form id="messaging">
      <textarea id="message"></textarea>
      <button type="submit">send message</button>
    </form>

    <pre id="outgoing"></pre>
    <script src="simplepeer.min.js"></script>
    <script>
    function updateDatabase(newVal, room) {
      // 1. Create a new XMLHttpRequest object
      var xhr = new XMLHttpRequest();

      // 2. Configure it: GET-request
      xhr.open('POST', 'saveOffer.php');

      // 3. Send the request over the network
      xhr.send('offerSignal='+newVal+"&room="+room);

      // 4. This will be called after the response is received
      xhr.onload = function() {
        if (xhr.status != 200) { // analyze HTTP status of the response
          alert(`Error ${xhr.status}: ${xhr.statusText}`); // e.g. 404: Not Found
        } else { // show the result
          alert(`Done, got ${xhr.response.length} bytes`); // responseText is the server
        }
      };

      xhr.onprogress = function(event) {
        if (event.lengthComputable) {
          alert(`Received ${event.loaded} of ${event.total} bytes`);
        } else {
          alert(`Received ${event.loaded} bytes`); // no Content-Length
        }

      };

      xhr.onerror = function() {
        alert("Request failed");
      };
    }
    </script>
    <script>
      // NOTE 1: If the URL (PHP) variables read type=newGame, we're the game computer, and thus the initiator of everything. (Otherwise we're not.)

      // NOTE 2: If we play on local LAN, we do NOT need iceServers (they'll just muck things up), so we can omit them in that case
      // Otherwise, this is a free STUN server (easy to obtain anywhere for free) and a free TURN server (how, I don't know, but it works)
      var isInit = (location.hash === '#init');
      const p = new SimplePeer({
        initiator: isInit,
        trickle: false,
        config: { iceServers: [{ urls: 'stun:stunserver.org:3478' }, { urls: "turn:numb.viagenie.ca:3478", credential:"HupseFlups2", username:"cyttildalionzo@gmail.com" }] },
      })

      //var room = "<?php echo $room; ?>";
      var room = 'AAAA';

      console.log("I AM initiator " + isInit);
      console.log("MY ROOM IS " + room);
      

      p.on('error', err => console.log('error', err))

      p.on('signal', data => {
        // if we're the initiator, and our type is an OFFER, save it in the database
        /*
        if(isInit && data.type == 'offer') {
          console.log("UPDATING DATABASE");
          updateDatabase(JSON.stringify(data), room);
        }*/

        console.log('SIGNAL', JSON.stringify(data))
        document.querySelector('#outgoing').textContent = JSON.stringify(data)
      })

      // for signaling (submitting events)
      document.querySelector('form#signaling').addEventListener('submit', ev => {
        ev.preventDefault()
        p.signal(JSON.parse(document.querySelector('#incoming').value))
      })

      // for messaging
      document.querySelector('form#messaging').addEventListener('submit', ev => {
        ev.preventDefault()
        p.send(document.querySelector("#message").value);
      })

      document.querySelector('form').addEventListener('submit', ev => {
        ev.preventDefault()
        p.signal(JSON.parse(document.querySelector('#incoming').value))
      })

      p.on('connect', () => {
        console.log('CONNECT')
        p.send('whatever' + Math.random())
      })

      p.on('data', data => {
        console.log('data: ' + data)
      })
    </script>
  </body>
</html>