var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

['6er.mp3', '6er.webm', 'stolen.mp3', 'stolen.webm', 'tur.mp3', 'tur.webm'].forEach(soundfile => {
	app.get('/' + soundfile, function(req, res){
	  res.sendFile(__dirname + '/' + soundfile);
	});
});

var players = {};
var packages = {};
var playerTurn = "";
var n_gifts = 20;

var nobody = 'Ingen';
var skiptimer;

for (var i=1; i<=n_gifts; i++) {
	packages['Gave ' + i] = nobody;
}

io.on('connection', function(socket){
	io.emit('player-turn', playerTurn);
	
	function emit_players() {
		io.emit('players', Object.keys(players).map(pname => ({"name": pname, "n_packages": players[pname].length})));
	}
	
	function emit_packages() {
		io.emit('packages', packages);
	}
	
	function skip_person() {
		setup_timer();
		
		var playerNames = Object.keys(players);
		var nextPlayerIndex = playerNames.indexOf(playerTurn) + 1;
	
		if (nextPlayerIndex >= playerNames.length) {
			nextPlayerIndex = 0;
		}
	
		playerTurn = playerNames[nextPlayerIndex];
		io.emit('player-turn', playerTurn);
	}
	
	function setup_timer() {
		// Start by clearing any timer that might exist
		clearTimeout(skiptimer);
		skiptimer = setTimeout(skip_person, 15000);
	}
	
	socket.on('add-player', function(msg) {
		if (typeof players[msg] === "undefined") {
			players[msg] = [];
		}
		
		if (playerTurn === "") {
			playerTurn = msg;
			io.emit('player-turn', msg);
			setup_timer();
		}
		
		emit_players();
		emit_packages();
	});
	
  socket.on('hit-dice', function(msg){
		if (msg === playerTurn) {
			var dice_throw = {"player": msg, "result": Math.floor((Math.random() * 6) + 1)};
	    io.emit('dice-hit', dice_throw);
		
			skip_person();
			
			if (dice_throw['result'] == 6) {
				emit_packages();
				socket.emit('steal-package');
			}
		}
  });
	
	socket.on('whose-turn', function(msg) {
		io.emit('player-turn', playerTurn);
	});
	
	socket.on('get-players', function(msg) {
		emit_players();
	});
	
	socket.on('steal-package', function(package) {
		// Update package
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

http.listen(port, function(){
  console.log('listening on *:' + port);
});
