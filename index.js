// Import required packages
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// Route to serve the main index file
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// Routes to serve the soundfiles
['6er.mp3', '6er.webm', 'stolen.mp3', 'stolen.webm', 'tur.mp3', 'tur.webm'].forEach(soundfile => {
	app.get('/' + soundfile, function(req, res){
	  res.sendFile(__dirname + '/' + soundfile);
	});
});

// Data containers
var players = {};
var packages = {};
var playerTurn = "";
var skiptimer;

// Game configuration
var n_gifts = 20;
var nobody = 'Ingen';

// Initialize the packages container
for (var i=1; i<=n_gifts; i++) {
	packages['Gave ' + i] = nobody;
}

// Setup the socket server
io.on('connection', function(socket){
	// Tell the players who has the next turn (this will happen everytime somebody connects)
	io.emit('player-turn', playerTurn);
	
	// Helper function to tell send the players dictionary
	function emit_players() {
		io.emit('players', Object.keys(players).map(pname => ({"name": pname, "n_packages": players[pname].length})));
	}
	
	// Helper function to send the packages dictionary
	function emit_packages() {
		io.emit('packages', packages);
	}
	
	// Function to skip a person if we wait more than 15 seconds
	function skip_person() {
		// Setup the next timer
		setup_timer();
		
		// Find the next player
		var playerNames = Object.keys(players);
		var nextPlayerIndex = playerNames.indexOf(playerTurn) + 1;
	
		if (nextPlayerIndex >= playerNames.length) {
			nextPlayerIndex = 0;
		}
	
		// Tell the players who that is
		playerTurn = playerNames[nextPlayerIndex];
		io.emit('player-turn', playerTurn);
	}
	
	// Clears any existing timer and sets up a new one
	function setup_timer() {
		// Start by clearing any timer that might exist
		clearTimeout(skiptimer);
		skiptimer = setTimeout(skip_person, 15000);
	}
	
	// Listen for new players joining
	socket.on('add-player', function(msg) {
		// Check if the player has joined before, if not, add them to the players dictionary
		if (typeof players[msg] === "undefined") {
			players[msg] = [];
		}
		
		// If this is the first player, we set it to be their turn
		if (playerTurn === "") {
			playerTurn = msg;
			io.emit('player-turn', msg);
			// We also want to start the skip timer
			setup_timer();
		}
		
		// Update the players on who is in the game and what packages there are
		emit_players();
		emit_packages();
	});
	
	// Listen for players requesting a dice hit
  socket.on('hit-dice', function(msg){
		// Only do something if it's their turn
		if (msg === playerTurn) {
			// Generate a random dice throw and send it to everybody
			var dice_throw = {"player": msg, "result": Math.floor((Math.random() * 6) + 1)};
	    io.emit('dice-hit', dice_throw);
		
			// Go to the next player
			skip_person();
			
			// If the player got a six, we tell them to steal
			if (dice_throw['result'] == 6) {
				emit_packages();
				socket.emit('steal-package');
			}
		}
  });
	
	// The players can request to know who has the current turn
	socket.on('whose-turn', function(msg) {
		io.emit('player-turn', playerTurn);
	});
	
	// And ask for a list of players in the game
	socket.on('get-players', function(msg) {
		emit_players();
	});
	
	// Listen for events of a player stealing a package
	socket.on('steal-package', function(package) {
		// Update the stolen package
		var old_owner = packages[package.p];
		packages[package.p] = package.player;
		
		// Update players and notify everybody
		if (old_owner !== nobody) {
			// Send notification
			io.emit('package-stolen', {'name': package.p, 'old_owner': old_owner, 'new_owner': package.player});
			
			// Remove element from previous owner
			players[old_owner].splice(players[old_owner].indexOf(package.p), 1);
		}
		
		// Add element to new owner
		players[package.player].push(package.p);
		
		// Update client side
		emit_players();
		emit_packages();
		
		// Log who has which packages
		console.log(JSON.stringify(packages));
	});
});

// Start the server
http.listen(port, function(){
  console.log('listening on *:' + port);
});
