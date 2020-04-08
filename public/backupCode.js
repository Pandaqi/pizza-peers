createWorkspace() {
      // find random starting location
      var x,y;
      var margin = 3;
      do {
        x = Math.floor(Math.random() * (this.mapWidth - margin*2)) + margin;
        y = Math.floor(Math.random() * (this.mapHeight - margin*2)) + margin;
      } while( !this.mapCheck(x, y, 10, this.existingWorkspaces) );

      //
      // use the "bool shape" algorithm to create an IRREGULAR workspace shape
      // (whilst keeping track of the border for easy wall placement later)
      //

      // start two lists: points already processed, and current border points of the shape
      // add the first random point to both lists
      var processed = [ [x,y] ];
      var borderPoints = [ [x,y] ];
      var maxShapeSize = 20;

      this.createRoomFloor(x, y);

      var algorithmDone = false;
      var fillProbHorizontal = 0.9;
      var fillProbVertical = fillProbHorizontal * (2/3);
      while(!algorithmDone) {
        // take first point in border points
        var p = borderPoints.shift();

        // add to processed list
        processed.push(p);

        // go through neighbours
        var dirs = [[1,0], [-1,0], [0,1], [0,-1]];
        for(var i = 0; i < 4; i++) {
          var newPoint = [ p[0] + dirs[i][0], p[1] + dirs[i][1] ];

          // check if this is allowed according to the current map
          if( this.map[newPoint[0]][newPoint[1]] != 0) {
            continue;
          }

          // if not, fill it with a random probability
          var tempProb = (i <= 1) ? fillProbHorizontal : fillProbVertical;
          if(Math.random() <= tempProb) {
            borderPoints.push(newPoint);

            this.createRoomFloor(newPoint[0], newPoint[1]);
          }
        }

        // stop the algorithm when we have no more border points OR the shape is already large enough
        algorithmDone = (borderPoints.length <= 0 || processed.length > maxShapeSize);
      }

      //
      // create WALLS around the shape
      // 

      // in case we terminated because of maximum size, concatenate both lists (together, they hold all the points)
      processed = processed.concat(borderPoints);
      processed = this.shuffle(processed); // also, evaluate in random order

      var roadPoints = [[], [], [], []];
      var tablePoints = [];

      // go through all points
      for(var i = 0; i < processed.length; i++) {
        var p = processed[i];

        // check their neighbours
        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        var numWalls = 0;
        for(var d = 3; d >= 0; d--) {
          // each neighbour that EXISTS, ignore it (can't place a wall there!)
          var pX = p[0] + dirs[d][0], pY = p[1] + dirs[d][1];
          if(this.map[pX][pY] == 5) {
            continue;
          }

          numWalls++;

          // otherwise, place a wall
          // use index "d" to determine the rotation/placement of the wall
          var wall;

          if(d == 0 || d == 2) {
            wall = this.add.sprite(pX * this.tileWidth, pY * this.tileHeight, 'staticAssets');
          } else {
            wall = this.wallBodies.create(pX * this.tileWidth, pY * this.tileHeight, 'staticAssets');
          }
          var secondWall = null;

          wall.setOrigin(0.5, 1);
          wall.y += 0.5*this.tileHeight;
          wall.setFrame(4 + d);

          if(d == 0 || d == 2) {
            wall.setFrame(4);

            // create an extra wall above us!
            // NOTE: The second wall does not have an overlap body, because we can never be behind it
            secondWall = this.add.sprite(wall.x, wall.y - this.tileHeight, 'staticAssets');
            secondWall.setOrigin(0.5, 1);
            secondWall.setFrame(6);

            if(d == 0) {
              wall.x -= (0.5)*this.tileWidth;
              secondWall.x = wall.x;
            } else {
              wall.x += (0.5)*this.tileWidth;
              secondWall.x = wall.x;
            }

            secondWall.setScale(4,4);
            secondWall.depth = wall.y;

          } else if(d == 1) {
            wall.y -= this.tileHeight;
          }

          wall.depth = wall.y;
          wall.setScale(4,4);

          // add wall shadow
          var offsetX = 5, offsetY = 0;
          this.shadowGraphics.fillRect(wall.x - 0.5*wall.displayWidth - offsetX, wall.y - wall.displayHeight + offsetY, wall.displayWidth, wall.displayHeight);

          // now create the ACTUAL body that will function as this wall
          var wallActual = this.wallBodiesActual.create(wall.x, wall.y, null);
          wallActual.displayWidth = wall.displayWidth;
          wallActual.displayHeight = wall.displayHeight * (1/4)

          if(d == 0 || d == 2) {
            wallActual.displayWidth = (1/5) * wall.displayWidth;
            wallActual.displayHeight = wall.displayHeight;
            //wallActual.y = wall.y - (0.5 - (1/8))*this.tileHeight;
          } else {

            // what's this? well, side walls (vertical) do not have an overlap body
            // so ONLY refresh the (original overlap) body if d != 0 and d != 2
            wall.refreshBody();
          }

          wallActual.setOrigin(0.5, 1);
          wallActual.refreshBody();
          wallActual.setVisible(false);
          wall.myActual = wallActual;

          if(d == 0 || d == 2) {
            var secondWallActual = this.wallBodiesActual.create(secondWall.x, secondWall.y, null)
            secondWallActual.displayWidth = (1/5) * wall.displayWidth;
            secondWallActual.displayHeight = (1/4)*wall.displayHeight;
            secondWallActual.setOrigin(0.5, 1);
            secondWallActual.refreshBody();
            secondWallActual.setVisible(false);

            secondWall.myActual = secondWallActual;
          }

          

          if(this.map[pX][pY] == 0) {
            // save that there's a possible road point in this direction
            // AND which wall we'd need to remove to get there
            roadPoints[d].push( [p[0], p[1], wall, secondWall] );
          }
        }

        // only allow tables with ALL empty space around them
        // TO DO: Alternative is allowing tables when pushed up against a wall, or some more complex check that runs through all points
        if(numWalls == 0) {
          tablePoints.push(p);
        }
      }

      // go through some roadPoints, shuffled 
      // (but don't actually shuffle it, otherwise we lose the direction)
      var numOpenings = 2;
      var curOpenings = 0;
      var curCounter = 0;
      var chosenOpenings = [];
      while(curOpenings < numOpenings) {
        if(roadPoints[curCounter] == null) { continue; }
        if(roadPoints[curCounter].length <= 0) { continue; } // TO DO: Check if ALL roadPoints are exhausted
        curCounter = (curCounter + 1) % 4;

        // skip directions randomly
        if(Math.random() <= 0.75) { continue; }

        // pick a random point
        // also REMOVE it from the list, so it's not used twice
        var rP = roadPoints[curCounter].splice(Math.floor(Math.random() * roadPoints[curCounter].length), 1)[0];

        var dirs = [[1,0], [0,1], [-1,0], [0,-1]];
        var finalDir = (curCounter+2)%4; // again, reversed
        
        // if this road would be impossible (edge of map), don't do it
        // NOTE: Should already be checked when ADDING possible roads
        /*if(this.map[ rP[0] + dirs[finalDir][0] ][rP[1] + dirs[finalDir[1]] ] == -1) {
          continue;
        }*/

        // destroy the wall
        // (and the extra wall, if necessary)
        rP[2].myActual.destroy();
        rP[2].destroy();
        if(rP[3] != null) { rP[3].myActual.destroy(); rP[3].destroy(); }

        // remember the opening we chose, so we make sure not to place something there (like a table)
        chosenOpenings.push([rP[0], rP[1]]);

        // extend the road in the specificed direction
        this.extendRoad(rP[0], rP[1], dirs, finalDir);

        curOpenings++;
      }

      //
      // place tables in the work space
      // grab randomly from possible table points, don't allow tables at openings
      //
      var numTables = 5;
      for(var i = 0; i < numTables; i++) {
        if(tablePoints.length <= 0) { break; }

        var p = tablePoints.splice(Math.floor(Math.random() * tablePoints.length), 1)[0];

        // if it's an opening, continue, but decrease iterator
        var isOpening = false;
        for(var o = 0; o < chosenOpenings.length; o++) {
          if(chosenOpenings[o][0] == p[0] && chosenOpenings[o][1] == p[1]) {
            isOpening = true;
            break;
          }
        }
        if(isOpening) { i--; continue; }

        var table = this.createTable(p[0], p[1]);
      }
      
      // finally, add to existing workspaces
      this.existingWorkspaces.push({ 'x': x, 'y': y });
    },