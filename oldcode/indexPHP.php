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
      // If we play on local LAN, we do NOT need iceServers (they'll just muck things up), so we can omit them in that case
      // Otherwise, this is a free STUN server (easy to obtain anywhere for free) and a free TURN server (how, I don't know, but it works)
      const p = new SimplePeer({
        initiator: location.hash === '#init',
        trickle: false,
        config: { iceServers: [{ urls: 'stun:stunserver.org:3478' }, { urls: "turn:numb.viagenie.ca:3478", credential:"HupseFlups2", username:"cyttildalionzo@gmail.com" }] },
      })

      

      p.on('error', err => console.log('error', err))

      p.on('signal', data => {
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