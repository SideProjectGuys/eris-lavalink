'use strict';

const Player = require('./src/Player');
const PlayerManager = require('./src/PlayerManager');
const Lavalink = require('./src/Lavalink');

function ErisLavalink (client, nodes, options) {
	return new PlayerManager(client, nodes, options);
}

ErisLavalink.Player = Player;
ErisLavalink.PlayerManager = PlayerManager;
ErisLavalink.Lavalink = Lavalink;

module.exports = ErisLavalink;