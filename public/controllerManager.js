// global variable to make debugging on computer easier
var mouseDown = false;

// the current peer connected with this (smartphone) interface
var curPeer = null;

function mouseUp(ev) {
  mouseDown = false; 
  var msg = { 'type': 'move', 'vec': [0,0] };
  curPeer.send( JSON.stringify(msg) );
}

function onTouchEvent(e) {
  // grab the right coordinates (distinguish between touches, mouse, etc.)
  var x = 0, y = 0;

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
    var msg = { 'type': 'move', 'vec': [0,0] };
    curPeer.send( JSON.stringify(msg) );

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
  curPeer.send( JSON.stringify(message) );

  return false;
}

export function startController(peer) {
  // save reference to our peer
  curPeer = peer;

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

  // Add event listener to button for sending messages (chat-like functionality)
  document.getElementById('sendMessageBtn').addEventListener('click', function(ev) {
      // Disable button + default actions
      ev.preventDefault()

      // send content of text area
      var message = { 'type': 'msg', 'value': document.getElementById('messageContent').value }; 
      curPeer.send( JSON.stringify(message) );

      // clear text area
      document.getElementById('messageContent').value = '';
  });
}