import { MainGame } from './mainGame.js';
import { GameOver } from './gameOver.js';

export function startPhaser(connection) {
  // initialize Phaser game
  // URL (Arcade Physics world init): https://rexrainbow.github.io/phaser3-rex-notes/docs/site/arcade-world/#configuration
  var config = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    backgroundColor: '#8EB526',
    parent: 'phaser-game',
    scene: [MainGame, GameOver],
    physics: {
        default: 'arcade',
        arcade: { 
          debug: false,
        }
    },
    pixelArt: true,
    antialias: false,
  }

  // create the game and save it in a GLOBAL variable, accessible anywhere
  window.GAME = new Phaser.Game(config); 

  // Passing data to a scene: https://www.html5gamedevs.com/topic/36148-phaser-3-scene-phaser-2-state-passing-data-to-init-when-start/
  // (if not needed, just automatically active the scene by using { active: true } in the constructor)
  GAME.scene.start('mainGame', { roomCode: connection.room });
  GAME.scene.start('gameOver', {});
}