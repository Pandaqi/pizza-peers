// STUFF (devlog) about scenes: https://phaser.io/phaser3/devlog/121
// STUFF about modules and variable sharing: https://stackoverflow.com/questions/23521069/global-variables-shared-amongst-javascript-modules
export const GameOver = new Phaser.Class({

    Extends: Phaser.Scene,

    initialize:
    function GameOver()
    {
        Phaser.Scene.call(this, { key: 'gameOver' });
    },

    preload: function() {
      this.load.crossOrigin = 'Anonymous';
      this.load.spritesheet('gameOver', 'assets/gameOver.png', { frameWidth: 64, frameHeight: 64 });
    },

    create: function(config) {
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

      // start with the loading screen
      this.setScreen(false, 'loading');
    },

    setScreen: function(win, reason) {
      // special cases: loading and game lobby
      if(reason == 'loading') {
        this.mainText.text = 'LOADING ... ';
        this.bodyText.text = 'This should take at most 5-10 seconds.\n\n\n If it takes longer, something went wrong and you must reload the page. Sorry, internet is unpredictable :(';
        return;

      } else if(reason == 'game lobby') {
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

      this.bodyText.text += '\n\n\nWant to play again? Press the R key. The VIP also has a button to restart.'
    }
});