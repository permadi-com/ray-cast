/**********************************************
Raycasting implementation in Javascript.
First Demo
Source: https://github.com/permadi-com/ray-cast/tree/master/demo/3

See it in action: https://permadi.com/tutorial/raycast/demo/3/

What's on this demo:
Wall finding
Generating lookup tables
Fishbowl / distortion corrections
Rendering of simple (static) ground and sky
Movement handling
Textured wall
Collision detection
Double buffering
---------------

License: MIT (https://opensource.org/licenses/MIT)

Copyright 2015-2018 F. Permadi

Permission is hereby granted, free of charge, to any person obtaining a copy of this 
software and associated documentation files (the "Software"), 
to deal in the Software without restriction, 
including without limitation the rights to use, copy, modify, merge, publish, 
distribute, sublicense, and/or sell copies of the Software, and to permit persons to 
whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

***********************************************/
function GameWindow(canvas) {
    this.width = canvas.width;
    this.height = canvas.height;  
    this.frameRate =24;
    // create the main canvas
    this.canvas = canvas;  
    this.canvasContext = this.canvas.getContext( '2d' );
     
    // create the offscreen buffer (canvas)
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = canvas.width;
    this.offscreenCanvas.height = canvas.height;
    this.offscreenCanvasContext = this.offscreenCanvas.getContext('2d');
	this.offscreenCanvasPixels =  this.offscreenCanvasContext.getImageData(0,0,canvas.width, canvas.height);
 
	// size of tile (wall height)
	this.TILE_SIZE = 64;
	this.WALL_HEIGHT = 64;
	
	// Remember that PROJECTIONPLANE = screen.  This demo assumes your screen is 320 pixels wide, 200 pixels high
	this.PROJECTIONPLANEWIDTH = 320;
	this.PROJECTIONPLANEHEIGHT = 200;
	
	// We use FOV of 60 degrees.  So we use this FOV basis of the table, taking into account
	// that we need to cast 320 rays (PROJECTIONPLANEWIDTH) within that 60 degree FOV.
	this.ANGLE60 = this.PROJECTIONPLANEWIDTH;
	// You must make sure these values are integers because we're using loopup tables.
	this.ANGLE30 = Math.floor(this.ANGLE60/2);
	this.ANGLE15 = Math.floor(this.ANGLE30/2);
	this.ANGLE90 = Math.floor(this.ANGLE30*3);
	this.ANGLE180 = Math.floor(this.ANGLE90*2);
	this.ANGLE270 = Math.floor(this.ANGLE90*3);
	this.ANGLE360 = Math.floor(this.ANGLE60*6);
	this.ANGLE0 = 0;
	this.ANGLE5 = Math.floor(this.ANGLE30/6);
	this.ANGLE10 = Math.floor(this.ANGLE5*2);
	this.ANGLE45 = Math.floor(this.ANGLE15*3);
	
	// trigonometric tables (the ones with "I" such as ISiTable are "Inverse" table)
	this.fSinTable=[];
	this.fISinTable=[];
	this.fCosTable=[];
	this.fICosTable=[];
	this.fTanTable=[];
	this.fITanTable=[];
	this.fFishTable=[];
	this.fXStepTable=[];
	this.fYStepTable=[];

	// player's attributes
	this.fPlayerX = 100;
	this.fPlayerY = 160;
	this.fPlayerArc = this.ANGLE5+this.ANGLE5;
	this.fPlayerDistanceToTheProjectionPlane = 277;
	this.fPlayerHeight =32;
	this.fPlayerSpeed = 16;
	
	// Half of the screen height
	this.fProjectionPlaneYCenter = this.PROJECTIONPLANEHEIGHT/2;

	// the following variables are used to keep the player coordinate in the overhead map
	this.fPlayerMapX;
	this.fPlayerMapY;
	this.fMinimapWidth;

	// movement flag
	this.fKeyUp=false;
	this.fKeyDown=false;
	this.fKeyLeft=false; 
	this.fKeyRight=false;

	// 2 dimensional map
	this.fMap=[];
	this.MAP_WIDTH;
	this.MAP_HEIGHT; 
	
	this.animationFrameID;
	
	this.fWallTextureCanvas;
	this.fWallTexturePixels;
	
} 

GameWindow.prototype = 
{
	loadWallTexture : function()
	{
		this.fWallTexture= new Image();
		this.fWallTexture.crossOrigin = "Anonymous";

		this.fWallTexture.onload = this.onWallTextureLoaded.bind(this);
		  
		this.fWallTexture.src = "images/tile07.jpg";		
	},
	
	onWallTextureLoaded : function(image)
	{
		console.log("onWallTextureLoaded image="+this.fWallTexture+" image.width="+this.fWallTexture.width);
		// create an in-memory canvas
		this.fWallTextureBuffer = document.createElement('canvas');		
		this.fWallTextureBuffer.width = this.fWallTexture.width;
		this.fWallTextureBuffer.height = this.fWallTexture.height;
		this.fWallTextureBuffer.getContext('2d').drawImage(this.fWallTexture, 0, 0);
		
		var imageData = this.fWallTextureBuffer.getContext('2d').getImageData(0, 0, this.fWallTextureBuffer.width, this.fWallTextureBuffer.height);
		this.fWallTexturePixels = imageData.data;
		//console.log("onWallTextureLoaded imageData="+this.fWallTexturePixels);
	},
	
	//*******************************************************************//
	//* Convert arc (degree) to radian
	//*******************************************************************//
	arcToRad: function(arcAngle)
	{
		return ((arcAngle*Math.PI)/this.ANGLE180);    
	},
	
	drawLine: function(startX, startY, endX, endY, red, green, blue, alpha)
	{
		var bytesPerPixel=4;
		// changes in x and y
		var xIncrement, yIncrement;  


		// calculate Ydistance	
		var dy=endY-startY;             
		
		// if moving negative dir (up)	
		// note that we can simplify this function if we can guarantee that
		// the line will always move in one direction only
		if (dy<0)             
		{
			// get abs
			dy=-dy;
			// negative movement
			yIncrement=-this.offscreenCanvasPixels.width*bytesPerPixel;
		}
		else
			yIncrement=this.offscreenCanvasPixels.width*bytesPerPixel;
							  
		// calc x distance		                  
		var dx=endX-startX;         
		
		// if negative dir (left)
		// note that we can simplify this function if we can guarantee that
		// the line will always move in one direction only
		if (dx<0)
		{
			dx=-dx;
			xIncrement=-bytesPerPixel;
		}
		else
			xIncrement=bytesPerPixel;

		// deflation		
		var error=0;
		var targetIndex=(bytesPerPixel*this.offscreenCanvasPixels.width)*startY+(bytesPerPixel*startX);
		
		// if movement in x direction is larger than in y
		// ie: width > height
		// we draw each row one by one
		if (dx>dy)
		{                     
			// length = width +1
			var length=dx;
			
			for (var i=0;i<length;i++)
			{
				if (targetIndex<0)
					break;
					
				this.offscreenCanvasPixels.data[targetIndex]=red;
				this.offscreenCanvasPixels.data[targetIndex+1]=green;
				this.offscreenCanvasPixels.data[targetIndex+2]=blue;
				this.offscreenCanvasPixels.data[targetIndex+3]=alpha;
				
				// either move left/right
				targetIndex+=xIncrement;           
				// cumulate error term
				error+=dy;
									  
				// is it time to move y direction (chage row)			                      
				if (error>=dx)
				{
					error-=dx;
					// move to next row
					targetIndex+=yIncrement;
				}
			}
		}
		// if movement in y direction is larger than in x
		// ie: height > width
		// we draw each column one by one
		// note that a diagonal line will go here because xdiff = ydiff
		else //(YDiff>=XDiff)
		{                       
			var length=dy;
			
			for (var i=0;i<length;i++)
			{       
				if (targetIndex<0)
					break;
					
					
				this.offscreenCanvasPixels.data[targetIndex]=red;
				this.offscreenCanvasPixels.data[targetIndex+1]=green;
				this.offscreenCanvasPixels.data[targetIndex+2]=blue;
				this.offscreenCanvasPixels.data[targetIndex+3]=alpha;
				
				targetIndex+=yIncrement;
				error+=dx;
				
				if (error>=dy)
				{
					error-=dy;
					targetIndex+=xIncrement;
				}
			}
		}
	},
	

	
	drawWallSliceRectangleTinted: function(x, y, width, height, xOffset, brighnessLevel)
	{
		
		//console.log("this.fWallTextureBuffer="+this.fWallTextureBuffer);
		//var xOffset=x%this.fWallTexture.width;	// wrap the image position
		
		// wait until the texture loads
		if (this.fWallTextureBuffer==undefined)
			return;
		
		var dy=height;
		x=Math.floor(x);
		y=Math.floor(y);
		xOffset=Math.floor(xOffset);
		var bytesPerPixel=4;
		
		var sourceIndex=(bytesPerPixel*xOffset);
		var lastSourceIndex=sourceIndex+(this.fWallTextureBuffer.width*this.fWallTextureBuffer.height*bytesPerPixel);
		
		var targetIndex=(this.offscreenCanvasPixels.width*bytesPerPixel)*y+(bytesPerPixel*x);

		var heightToDraw = height;
		// clip bottom
		if (y+heightToDraw>this.offscreenCanvasPixels.height)
			heightToDraw=this.offscreenCanvasPixels.height-y;


		var yError=0;   
		

		// we need to check this, otherwise, program might crash when trying
		// to fetch the shade if this condition is true (possible if height is 0)
		if (heightToDraw<0)
			return;

		while (true)
		{                     
			// if error < actualHeight, this will cause row to be skipped until
			// this addition sums to scaledHeight
			// if error > actualHeight, this ill cause row to be drawn repeatedly until
			// this addition becomes smaller than actualHeight
			// 1) Think the image height as 100, if percent is >= 100, we'll need to
			// copy the same pixel over and over while decrementing the percentage.  
			// 2) Similarly, if percent is <100, we skip a pixel while incrementing
			// and do 1) when the percentage we're adding has reached >=100
			yError += height;
												 
   	
			var red=Math.floor(this.fWallTexturePixels[sourceIndex]*brighnessLevel);
			var green=Math.floor(this.fWallTexturePixels[sourceIndex+1]*brighnessLevel);
			var blue=Math.floor(this.fWallTexturePixels[sourceIndex+2]*brighnessLevel);
			var alpha=Math.floor(this.fWallTexturePixels[sourceIndex+3]);
			
			// while there's a row to draw & not end of drawing area
			while (yError>=this.fWallTextureBuffer.width)
			{                  
				yError-=this.fWallTextureBuffer.width;
				this.offscreenCanvasPixels.data[targetIndex]=red;
				this.offscreenCanvasPixels.data[targetIndex+1]=green;
				this.offscreenCanvasPixels.data[targetIndex+2]=blue;
				this.offscreenCanvasPixels.data[targetIndex+3]=alpha;
				targetIndex+=(bytesPerPixel*this.offscreenCanvasPixels.width);
				// clip bottom (just return if we reach bottom)
				heightToDraw--;
				if (heightToDraw<1)
					return;
			} 
			sourceIndex+=(bytesPerPixel*this.fWallTextureBuffer.width);
			if (sourceIndex>lastSourceIndex)
				sourceIndex=lastSourceIndex;			
		}

	},	
	
	clearOffscreenCanvas : function()
	{
		var targetIndex=0;
		var bytesPerPixel=4;
		for (var y=0; y<this.offscreenCanvasPixels.height; y++)
		{
			//console.log("y="+y+" targetIndex="+targetIndex)
			for (var x=0; x<this.offscreenCanvasPixels.width; x++)
			{
				this.offscreenCanvasPixels.data[targetIndex]=0;
				this.offscreenCanvasPixels.data[targetIndex+1]=0;
				this.offscreenCanvasPixels.data[targetIndex+2]=0;
				this.offscreenCanvasPixels.data[targetIndex+3]=0;
				targetIndex+=(bytesPerPixel);	
			}
		}			
		this.offscreenCanvasContext.clearRect(0, 0, this.width, this.height);
	},
	
	blitOffscreenCanvas : function()
	{
		var offscreenBgrCanvasPixels =  this.offscreenCanvasContext.getImageData(0,0,canvas.width, canvas.height);
		this.canvasContext.putImageData(offscreenBgrCanvasPixels,0,0);
		/*targetIndex=0;
		var bytesPerPixel=4;
		for (var y=0; y<this.height; y++)
		{
			console.log("y="+y+" targetIndex="+targetIndex)
			for (var x=0; x<this.width; x++)
			{
				this.offscreenCanvasPixels.data[targetIndex]=255;
				this.offscreenCanvasPixels.data[targetIndex+1]=255;
				this.offscreenCanvasPixels.data[targetIndex+2]=0;
				this.offscreenCanvasPixels.data[targetIndex+3]=255;
				targetIndex+=(bytesPerPixel);	
			}
		}	*/	
		this.canvasContext.putImageData(this.offscreenCanvasPixels,0,0);
	},
	
	drawFillRectangle: function(x, y, width, height, red, green, blue, alpha)
	{
		var bytesPerPixel=4;
		//var targetCanvasPixels=this.canvasContext.createImageData(0, 0, width, height);
		var targetIndex=(bytesPerPixel*this.offscreenCanvasPixels.width)*y+(bytesPerPixel*x);
		for (var h=0; h<height; h++)
		{
			for (var w=0; w<width; w++)
			{
				this.offscreenCanvasPixels.data[targetIndex]=red;
				this.offscreenCanvasPixels.data[targetIndex+1]=green;
				this.offscreenCanvasPixels.data[targetIndex+2]=blue;
				this.offscreenCanvasPixels.data[targetIndex+3]=alpha;
				targetIndex+=bytesPerPixel;
			}
			targetIndex+=(bytesPerPixel*(this.offscreenCanvasPixels.width-width));
		}	
	},
	
	init: function()
	{
		this.loadWallTexture();
		var i;
		var radian;
		this.fSinTable = new Array(this.ANGLE360+1);
		this.fISinTable = new Array(this.ANGLE360+1);
		this.fCosTable = new Array(this.ANGLE360+1);
		this.fICosTable = new Array(this.ANGLE360+1);
		this.fTanTable = new Array(this.ANGLE360+1);
		this.fITanTable = new Array(this.ANGLE360+1);
		this.fFishTable = new Array(this.ANGLE360+1);
		this.fXStepTable = new Array(this.ANGLE360+1);
		this.fYStepTable = new Array(this.ANGLE360+1);

		for (i=0; i<=this.ANGLE360;i++)
		{
			// Populate tables with their radian values.
			// (The addition of 0.0001 is a kludge to avoid divisions by 0. Removing it will produce unwanted holes in the wall when a ray is at 0, 90, 180, or 270 degree angles)
			radian = this.arcToRad(i) + (0.0001);
			this.fSinTable[i]=Math.sin(radian);
			this.fISinTable[i]=(1.0/(this.fSinTable[i]));
			this.fCosTable[i]=Math.cos(radian);
			this.fICosTable[i]=(1.0/(this.fCosTable[i]));
			this.fTanTable[i]=Math.tan(radian);
			this.fITanTable[i]=(1.0/this.fTanTable[i]);

			// Next we crate a table to speed up wall lookups.
			// 
			//  You can see that the distance between walls are the same
			//  if we know the angle
			//  _____|_/next xi______________
			//       |
			//  ____/|next xi_________   slope = tan = height / dist between xi's
			//     / |
			//  __/__|_________  dist between xi = height/tan where height=tile size
			// old xi|
			//                  distance between xi = x_step[view_angle];
			
			
			
			// Facing LEFT
			if (i>=this.ANGLE90 && i<this.ANGLE270)
			{
				this.fXStepTable[i] = (this.TILE_SIZE/this.fTanTable[i]);
				if (this.fXStepTable[i]>0)
					this.fXStepTable[i]=-this.fXStepTable[i];
			}
			// facing RIGHT
			else
			{
				this.fXStepTable[i] = (this.TILE_SIZE/this.fTanTable[i]);
				if (this.fXStepTable[i]<0)
					this.fXStepTable[i]=-this.fXStepTable[i];
			}

			// FACING DOWN
			if (i>=this.ANGLE0 && i<this.ANGLE180)
			{
				this.fYStepTable[i] = (this.TILE_SIZE*this.fTanTable[i]);
				if (this.fYStepTable[i]<0)
					this.fYStepTable[i]=-this.fYStepTable[i];
			}
			// FACING UP
			else
			{
				this.fYStepTable[i] = (this.TILE_SIZE*this.fTanTable[i]);
				if (this.fYStepTable[i]>0)
					this.fYStepTable[i]=-this.fYStepTable[i];
			}
		}

		// Create table for fixing FISHBOWL distortion
		for (i=-this.ANGLE30; i<=this.ANGLE30; i++)
		{
			radian = this.arcToRad(i);
			// we don't have negative angle, so make it start at 0
			// this will give range from column 0 to 319 (PROJECTONPLANEWIDTH) since we only will need to use those range
			this.fFishTable[i+this.ANGLE30] = (1.0/Math.cos(radian));
		}

        // CREATE A SIMPLE MAP.
		// Use string for elegance (easier to see).  W=Wall, O=Opening
        var map=
			'WWWWWWWWWWWW'+
			'WOOOOOOOOOOW'+
			'WOOOOOWOWOOW'+
			'WOOWOOWOWOOW'+
			'WOOWOOWOWOOW'+
			'WOOWOOWOWOOW'+
			'WOOWOOWOWOOW'+
			'WOOWOOWOWOOW'+
			'WOOWOOWOWOOW'+ 
			'WOOWWWWOWOOW'+
			'WOOOOOOOOOOW'+
			'WWWWWWWWWWWW';
        var map2=
			'WWWWWWWWWWWW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WOOOOOOOOOOW'+
			'WWWWWWWWWWWW';	
		var map3=
                'WWWWWWWWWWWW'+
                'WOOOOOOOOOOW'+
                'WOOOOOOOOOOW'+
                'WOOOOOOOWOOW'+
                'WOOWOWOOWOOW'+
                'WOOWOWWOWOOW'+
                'WOOWOOWOWOOW'+
                'WOOOWOWOWOOW'+
                'WOOOWOWOWOOW'+
                'WOOOWWWOWOOW'+
                'WOOOOOOOOOOW'+
                'WWWWWWWWWWWW';	
		// Remove spaces and tabs
        this.fMap=map3.replace(/\s+/g, '');
		this.MAP_WIDTH=12;
		this.MAP_HEIGHT=12; 		
	},
	
	//*******************************************************************//
	//* Draw map on the right side
	//*******************************************************************//
	drawOverheadMap : function()
	{
		this.fMinimapWidth=5;
		for (var r=0; r<this.MAP_HEIGHT; r++)
		{
			for (var c=0; c<this.MAP_WIDTH; c++)
			{
				var cssColor="white";
				if (this.fMap.charAt(r*this.MAP_WIDTH+c)!="O")
				{
					this.drawFillRectangle(this.PROJECTIONPLANEWIDTH+(c*this.fMinimapWidth),
						(r*this.fMinimapWidth), this.fMinimapWidth, this.fMinimapWidth, 0, 0,0, 255);
				}
				else
				{
					this.drawFillRectangle(this.PROJECTIONPLANEWIDTH+(c*this.fMinimapWidth),
						(r*this.fMinimapWidth), this.fMinimapWidth, this.fMinimapWidth, 255, 255,255, 255);
				}
			}
		}
		// Draw player position on the overhead map
		this.fPlayerMapX=this.PROJECTIONPLANEWIDTH+((this.fPlayerX/this.TILE_SIZE) * this.fMinimapWidth);
		this.fPlayerMapY=((this.fPlayerY/this.TILE_SIZE) * this.fMinimapWidth);
		
	},
	

	rgbToHexColor : function(red, green, blue) 
	{
		var result="#"+
			red.toString(16).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping:false})+""+
			green.toString(16).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping:false})+""+
			blue.toString(16).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping:false});
		return result;
	},

	//*******************************************************************//
	//* Draw background image
	//*******************************************************************//
	drawBackground : function()
	{
		
		// sky
		var color=255;
		var row;
		var incement=4;
		for (row=0; row<this.PROJECTIONPLANEHEIGHT/2; row+=incement)
		{
			this.drawFillRectangle(0, row, this.PROJECTIONPLANEWIDTH,incement, color/2, color,125, 255);			
			color-=incement*2;
		}
		// ground
		color=22;
		for (; row<this.PROJECTIONPLANEHEIGHT; row+=incement)
		{
			this.drawFillRectangle(0, row, this.PROJECTIONPLANEWIDTH,incement, color, 20,20, 255);			
			color+=incement;
		}
	},


	
	//*******************************************************************//
	//* Draw ray on the overhead map (for illustartion purpose)
	//* This is not part of the ray-casting process
	//*******************************************************************//
	drawRayOnOverheadMap : function(x, y)
	{
		//console.log("drawRayOnOverheadMap x="+y+" y="+y);
		// draw line from the player position to the position where the ray
		// intersect with wall
		this.drawLine(
			Math.floor(this.fPlayerMapX), 
			Math.floor(this.fPlayerMapY), 
			Math.floor(this.PROJECTIONPLANEWIDTH+((x*this.fMinimapWidth)/this.TILE_SIZE)),
			Math.floor(((y*this.fMinimapWidth)/this.TILE_SIZE)), 
			0,255,0,255);
	},
	
	//*******************************************************************//
	//* Draw player POV on the overhead map (for illustartion purpose)
	//* This is not part of the ray-casting process
	//*******************************************************************//
	drawPlayerPOVOnOverheadMap : function(x, y)
	{	
		// draw a red line indication the player's direction
		this.drawLine(
			Math.floor(this.fPlayerMapX), 
			Math.floor(this.fPlayerMapY), 
			Math.floor(this.fPlayerMapX+this.fCosTable[this.fPlayerArc]*10),
			Math.floor(this.fPlayerMapY+this.fSinTable[this.fPlayerArc]*10), 
			255,0,0,255);
  
	},
	

	
	
	//*******************************************************************//
	//* Renderer
	//*******************************************************************//
	raycast : function()
	{
		var verticalGrid;        // horizotal or vertical coordinate of intersection
		var horizontalGrid;      // theoritically, this will be multiple of TILE_SIZE
								 // , but some trick did here might cause
								 // the values off by 1
		var distToNextVerticalGrid; // how far to the next bound (this is multiple of
		var distToNextHorizontalGrid; // tile size)
		var xIntersection;  // x and y intersections
		var yIntersection;
		var distToNextXIntersection;
		var distToNextYIntersection;

		var xGridIndex;        // the current cell that the ray is in
		var yGridIndex;

		var distToVerticalGridBeingHit;      // the distance of the x and y ray intersections from
		var distToHorizontalGridBeingHit;      // the viewpoint

		var castArc, castColumn;
		var DEBUG=false;
		
		castArc = this.fPlayerArc;
		// field of view is 60 degree with the point of view (player's direction in the middle)
		// 30  30
		//    ^
		//  \ | /
		//   \|/
		//    v
		// we will trace the rays starting from the leftmost ray
		castArc-=this.ANGLE30;
		// wrap around if necessary
		if (castArc < 0)
		{
			castArc=this.ANGLE360 + castArc;
		}

		for (castColumn=0; castColumn<this.PROJECTIONPLANEWIDTH; castColumn+=1)
		{
			// Ray is between 0 to 180 degree (1st and 2nd quadrant).
			
			// Ray is facing down
			if (castArc > this.ANGLE0 && castArc < this.ANGLE180)
			{
				// truncuate then add to get the coordinate of the FIRST grid (horizontal
				// wall) that is in front of the player (this is in pixel unit)
				// ROUNDED DOWN
				horizontalGrid = Math.floor(this.fPlayerY/this.TILE_SIZE)*this.TILE_SIZE  + this.TILE_SIZE;

				// compute distance to the next horizontal wall
				distToNextHorizontalGrid = this.TILE_SIZE;

				var xtemp = this.fITanTable[castArc]*(horizontalGrid-this.fPlayerY);
				// we can get the vertical distance to that wall by
				// (horizontalGrid-playerY)
				// we can get the horizontal distance to that wall by
				// 1/tan(arc)*verticalDistance
				// find the x interception to that wall
				xIntersection = xtemp + this.fPlayerX;
				if (DEBUG)
				{				
					console.log("castArc="+castArc+" in CHECKPOINT A, horizontalGrid="+horizontalGrid+" distToNextHorizontalGrid="+distToNextHorizontalGrid+
						" xtemp="+xtemp+" xIntersection="+xIntersection);				
				}				
			}
			// Else, the ray is facing up
			else
			{
				horizontalGrid = Math.floor(this.fPlayerY/this.TILE_SIZE)*this.TILE_SIZE;
				distToNextHorizontalGrid = -this.TILE_SIZE;

				var xtemp = this.fITanTable[castArc]*(horizontalGrid - this.fPlayerY);
				xIntersection = xtemp + this.fPlayerX;

				horizontalGrid--;
				if (DEBUG)
				{				
					console.log("castArc="+castArc+" in CHECKPOINT B, horizontalGrid="+horizontalGrid+" distToNextHorizontalGrid="+distToNextHorizontalGrid+
						" xtemp="+xtemp+" xIntersection="+xIntersection);				
				}
			}
			// LOOK FOR HORIZONTAL WALL
			
			// If ray is directly facing right or left, then ignore it 
			if (castArc==this.ANGLE0 || castArc==this.ANGLE180)
			{
				distToHorizontalGridBeingHit=Number.MAX_VALUE;
			}
			// else, move the ray until it hits a horizontal wall
			else
			{
				distToNextXIntersection = this.fXStepTable[castArc];
				while (true)
				{
					xGridIndex = Math.floor(xIntersection/this.TILE_SIZE);
					yGridIndex = Math.floor(horizontalGrid/this.TILE_SIZE);
					var mapIndex=Math.floor(yGridIndex*this.MAP_WIDTH+xGridIndex);
					if (DEBUG)
					{										
						console.log("this.fPlayerY="+this.fPlayerY+" this.fPlayerX="+this.fPlayerX+" castColumn="+castColumn+" castArc="+castArc+" xIntersection="+xIntersection+" horizontalGrid="+horizontalGrid+" xGridIndex="+xGridIndex+" yGridIndex="+yGridIndex+" mapIndex="+mapIndex);
						console.log("this.fITanTable="+this.fITanTable[castArc]);
					}
					
					// If we've looked as far as outside the map range, then bail out
					if ((xGridIndex>=this.MAP_WIDTH) ||
						(yGridIndex>=this.MAP_HEIGHT) ||
						xGridIndex<0 || yGridIndex<0)
					{
						distToHorizontalGridBeingHit = Number.MAX_VALUE;
						break;
					}
					// If the grid is not an Opening, then stop
					else if (this.fMap.charAt(mapIndex)!='O')
					{
						distToHorizontalGridBeingHit  = (xIntersection-this.fPlayerX)*this.fICosTable[castArc];
						break;
					}
					// Else, keep looking.  At this point, the ray is not blocked, extend the ray to the next grid
					else
					{
						xIntersection += distToNextXIntersection;
						horizontalGrid += distToNextHorizontalGrid;
					}
				}
			}


			// FOLLOW X RAY
			if (castArc < this.ANGLE90 || castArc > this.ANGLE270)
			{
				verticalGrid = this.TILE_SIZE + Math.floor(this.fPlayerX/this.TILE_SIZE)*this.TILE_SIZE;
				distToNextVerticalGrid = this.TILE_SIZE;

				var ytemp = this.fTanTable[castArc]*(verticalGrid - this.fPlayerX);
				yIntersection = ytemp + this.fPlayerY;
				if (DEBUG)
				{				
					
					console.log("castArc="+castArc+" in CHECKPOINT C, horizontalGrid="+horizontalGrid+" distToNextHorizontalGrid="+distToNextHorizontalGrid+
						" ytemp="+ytemp+" yIntersection="+yIntersection);				
				}
			}
			// RAY FACING LEFT
			else
			{
				verticalGrid = Math.floor(this.fPlayerX/this.TILE_SIZE)*this.TILE_SIZE;
				distToNextVerticalGrid = -this.TILE_SIZE;

				var ytemp = this.fTanTable[castArc]*(verticalGrid - this.fPlayerX);
				yIntersection = ytemp + this.fPlayerY;

				verticalGrid--;
				if (DEBUG)
				{								
					console.log("castArc="+castArc+" in CHECKPOINT D, horizontalGrid="+horizontalGrid+" distToNextHorizontalGrid="+distToNextHorizontalGrid+
						" ytemp="+ytemp+" yIntersection="+yIntersection);					
				}
			}
			  // LOOK FOR VERTICAL WALL
			if (castArc==this.ANGLE90||castArc==this.ANGLE270)
			{
				distToVerticalGridBeingHit = Number.MAX_VALUE;
			}
			else
			{
				distToNextYIntersection = this.fYStepTable[castArc];
				while (true)
				{
					// compute current map position to inspect
					xGridIndex = Math.floor(verticalGrid/this.TILE_SIZE);
					yGridIndex = Math.floor(yIntersection/this.TILE_SIZE);

					var mapIndex=Math.floor(yGridIndex*this.MAP_WIDTH+xGridIndex);
					
					if (DEBUG)
					{
						console.log("this.fPlayerY="+this.fPlayerY+" this.fPlayerX="+this.fPlayerX+" castColumn="+castColumn+" castArc="+castArc+" xIntersection="+xIntersection+" horizontalGrid="+horizontalGrid+" xGridIndex="+xGridIndex+" yGridIndex="+yGridIndex+" mapIndex="+mapIndex);
						console.log("this.fITanTable="+this.fITanTable[castArc]);
					}
					
					if ((xGridIndex>=this.MAP_WIDTH) || 
						(yGridIndex>=this.MAP_HEIGHT) ||
						xGridIndex<0 || yGridIndex<0)
					{
						distToVerticalGridBeingHit = Number.MAX_VALUE;
						break;
					}
					else if (this.fMap.charAt(mapIndex)!='O')
					{
						distToVerticalGridBeingHit =(yIntersection-this.fPlayerY)*this.fISinTable[castArc];
						break;
					}
					else
					{
						yIntersection += distToNextYIntersection;
						verticalGrid += distToNextVerticalGrid;
					}
				}
			}

			// DRAW THE WALL SLICE
			var scaleFactor;
			var dist;
			var xOffset;
			var topOfWall;   // used to compute the top and bottom of the sliver that
			var bottomOfWall;   // will be the staring point of floor and ceiling
			// determine which ray strikes a closer wall.
			// if yray distance to the wall is closer, the yDistance will be shorter than
			// the xDistance
			var isVerticalHit=false;
			if (distToHorizontalGridBeingHit < distToVerticalGridBeingHit)
			{
				// the next function call (drawRayOnMap()) is not a part of raycating rendering part, 
				// it just draws the ray on the overhead map to illustrate the raycasting process
				this.drawRayOnOverheadMap(xIntersection, horizontalGrid);
				dist=distToHorizontalGridBeingHit;
				xOffset=xIntersection%this.TILE_SIZE;
				if (DEBUG)
				{				
					console.log("castColumn="+castColumn+" using distToHorizontalGridBeingHit");
				}
			}
			// else, we use xray instead (meaning the vertical wall is closer than
			//   the horizontal wall)
			else
			{
				isVerticalHit=true;
				// the next function call (drawRayOnMap()) is not a part of raycating rendering part, 
				// it just draws the ray on the overhead map to illustrate the raycasting process
				this.drawRayOnOverheadMap(verticalGrid, yIntersection);
				dist=distToVerticalGridBeingHit;
				xOffset=yIntersection%this.TILE_SIZE;
				
				if (DEBUG)
				{				
					console.log("castColumn="+castColumn+" using distToVerticalGridBeingHit");
				}
			}

			// correct distance (compensate for the fishbown effect)
			dist /= this.fFishTable[castColumn];
			// projected_wall_height/wall_height = fPlayerDistToProjectionPlane/dist;
			var projectedWallHeight=(this.WALL_HEIGHT*this.fPlayerDistanceToTheProjectionPlane/dist);
			bottomOfWall = this.fProjectionPlaneYCenter+(projectedWallHeight*0.5);
			topOfWall = this.fProjectionPlaneYCenter-(projectedWallHeight*0.5);

			if (DEBUG)
			{				
				console.log("castColumn="+castColumn+" distance="+dist);
			}  
			
			
			// Add simple shading so that farther wall slices appear darker.
			// 850 is arbitrary value of the farthest distance.  
			dist=Math.floor(dist);
			var color=255-(dist/550.0)*255.0;
			//color=255*(color/1000);
			// don't allow it to be too dark
			if (color<20)
				color=20;
			if (color>255)
				color=255;
			color=Math.floor(color);
			//var cssColor=this.rgbToHexColor(color,color,color);
			//console.log("dist="+dist+" color="+color);

			// Trick to give different shades between vertical and horizontal (you could also use different textures for each if you wish to)
			if (isVerticalHit)
				this.drawWallSliceRectangleTinted(castColumn, topOfWall, 1, (bottomOfWall-topOfWall)+1, xOffset, 160/(dist));
			else
				this.drawWallSliceRectangleTinted(castColumn, topOfWall, 1, (bottomOfWall-topOfWall)+1, xOffset, 100/(dist));
				
			// TRACE THE NEXT RAY
			castArc+=1;
			if (castArc>=this.ANGLE360)
				castArc-=this.ANGLE360;
		}

	},
  
	// This function is called every certain interval (see this.frameRate) to handle input and render the screen
	update : function() 
	{
		this.clearOffscreenCanvas();
		
		this.drawOverheadMap();
		this.drawBackground();
		this.raycast();
		this.drawPlayerPOVOnOverheadMap();
		this.blitOffscreenCanvas();
		//console.log("update");
		if (this.fKeyLeft)
		{
			this.fPlayerArc-=this.ANGLE10;
			if (this.fPlayerArc<this.ANGLE0)
				this.fPlayerArc+=this.ANGLE360;
		}
		  // rotate right
		else if (this.fKeyRight)
		{
			this.fPlayerArc+=this.ANGLE10;
			if (this.fPlayerArc>=this.ANGLE360)
				this.fPlayerArc-=this.ANGLE360;
		}

		//  _____     _
		// |\ arc     |
		// |  \       y
		// |    \     |
		//            -
		// |--x--|  
		//
		//  sin(arc)=y/diagonal
		//  cos(arc)=x/diagonal   where diagonal=speed
		var playerXDir=this.fCosTable[this.fPlayerArc];
		var playerYDir=this.fSinTable[this.fPlayerArc];

		
		var dx=0;
		var dy=0;
		// move forward
		if (this.fKeyUp)
		{
			dx=Math.round(playerXDir*this.fPlayerSpeed);
			dy=Math.round(playerYDir*this.fPlayerSpeed);
		}
		// move backward
		else if (this.fKeyDown)
		{
			dx=-Math.round(playerXDir*this.fPlayerSpeed);
			dy=-Math.round(playerYDir*this.fPlayerSpeed);
		}
		this.fPlayerX+=dx;
		this.fPlayerY+=dy;
		
		// compute cell position
		var playerXCell = Math.floor(this.fPlayerX/this.TILE_SIZE);
		var playerYCell = Math.floor(this.fPlayerY/this.TILE_SIZE);

		// compute position relative to cell (ie: how many pixel from edge of cell)
		var playerXCellOffset = this.fPlayerX % this.TILE_SIZE;
		var playerYCellOffset = this.fPlayerY % this.TILE_SIZE;

		var minDistanceToWall=30;
		
		// make sure the player don't bump into walls
		if (dx>0)
		{
			// moving right
			if ((this.fMap.charAt((playerYCell*this.MAP_WIDTH)+playerXCell+1)!='O')&&
				(playerXCellOffset > (this.TILE_SIZE-minDistanceToWall)))
			{
				// back player up
				this.fPlayerX-= (playerXCellOffset-(this.TILE_SIZE-minDistanceToWall));
			}               
		}
		else
		{
			// moving left
			if ((this.fMap.charAt((playerYCell*this.MAP_WIDTH)+playerXCell-1)!='O')&&
				(playerXCellOffset < (minDistanceToWall)))
			{
				// back player up
				this.fPlayerX+= (minDistanceToWall-playerXCellOffset);
			} 
		} 

		if (dy<0)
		{
			// moving up
			if ((this.fMap.charAt(((playerYCell-1)*this.MAP_WIDTH)+playerXCell)!='O')&&
				(playerYCellOffset < (minDistanceToWall)))
			{
				// back player up 
				this.fPlayerY+= (minDistanceToWall-playerYCellOffset);
			}
		}
		else
		{
			// moving down                                  
			if ((this.fMap.charAt(((playerYCell+1)*this.MAP_WIDTH)+playerXCell)!='O')&&
				(playerYCellOffset > (this.TILE_SIZE-minDistanceToWall)))
			{
				// back player up 
				this.fPlayerY-= (playerYCellOffset-(this.TILE_SIZE-minDistanceToWall ));
			}
		}    
		var object=this;
		
		// Render next frame
		setTimeout(function() 
		{
			object.animationFrameID = requestAnimationFrame(object.update.bind(object));
		}, 1000 / this.frameRate);		
		
	},

	handleKeyDown : function(e) 
	{

		if (!e)
			e = window.event;

		// UP keypad
		if (e.keyCode == '38'  || String.fromCharCode(e.keyCode)=='W') 
		{
			this.fKeyUp=true;

		}
		// DOWN keypad
		else if (e.keyCode == '40' || String.fromCharCode(e.keyCode)=='S') 
		{
			this.fKeyDown=true;
		}
		// LEFT keypad
		else if (e.keyCode == '37'  || String.fromCharCode(e.keyCode)=='A') 
		{
		   this.fKeyLeft=true;
		}
		// RIGHT keypad
		else if (e.keyCode == '39'  || String.fromCharCode(e.keyCode)=='D') 
		{
		   this.fKeyRight=true;
		}

	},
  

	handleKeyUp : function(e) 
	{
		if (!e)
			e = window.event;

		// UP keypad
		if (e.keyCode == '38'  || String.fromCharCode(e.keyCode)=='W') 
		{
			this.fKeyUp=false;

		}
		// DOWN keypad
		if (e.keyCode == '40' || String.fromCharCode(e.keyCode)=='S') 
		{
			this.fKeyDown=false;
		}
		// LEFT keypad
		if (e.keyCode == '37'  || String.fromCharCode(e.keyCode)=='A') 
		{
		   this.fKeyLeft=false;
		}
		// RIGHT keypad
		if (e.keyCode == '39'  || String.fromCharCode(e.keyCode)=='D') 
		{
		   this.fKeyRight=false;
		}
	},
	
	start : function()
	{

		this.init();
		window.addEventListener("keydown", this.handleKeyDown.bind(this), false);
		window.addEventListener("keyup", this.handleKeyUp.bind(this), false);
		
		this.animationFrameID = requestAnimationFrame(this.update.bind(this));
	}

}