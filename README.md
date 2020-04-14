![Pizza Peers Logo](/public/assets/mainLogo.gif)

# Pizza Peers
A free local multiplayer game, right in the browser, where everyone can connect and play with their smartphones. 
See the official game page for more information: [Pizza Peers - Tasty Multiplayer Fun](http://pandaqi.com/pizza-peers)

## Where can I play?
The game is hosted on a free Heroku server: [Pizza Peers](https://pizza-peers.herokuapp.com).

If this server ever goes down, you can easily roll your own. Just install this whole repository (which is Node.js + standard HTML/CSS/JavaScript) on your own server.

## Play with my smartphone?
Yes! 
* Start the game on your computer (by visiting the website and pressing "create game"), and you'll get a room code.
* Now whip out your smartphone(s), go to the same website, enter the room code (and a username), and click "join game"

Tada, you're playing a multiplayer game, and your phone is the controller. 
* The game itself lives on the computer (that's where the game world is drawn and game logic applied). 
* Your phone is literally your controller: use it to move your player around and press buttons to take actions, all updated in realtime.

## How does it work?
This game uses WebSockets and Peer-to-Peer technology to establish a direct connection between your phone and the computer. 

As long as you're on the same Wi-Fi network (or relatively close in distance), this means input is applied instantly and it feels like you're playing with an actual gamepad. These days, almost everyone has a smartphone with a browser, which means everyone can join and play these kinds of games within a matter of seconds.

I've written an in-depth article series about the creation of this game: [How I created "Pizza Peers"](http://pandaqi.com/blog/how-i-created-pizza-peers)

Questions? Feedback? Used my framework for your own game? Just let me know :)
