'use strict';

const WebSocket = require('ws');

var EventEmitter;

try {
	EventEmitter = require('eventemitter3');
} catch (err) {
	EventEmitter = require('events').EventEmitter;
}

/**
 * Represents a Lavalink node
 * @extends EventEmitter
 * @prop {String} host The hostname for the node
 * @prop {Number} port The port number for the node
 * @prop {String} address The full ws address for the node
 * @prop {String} region The region for this node
 * @prop {String} userId The client user id
 * @prop {Number} numShards The total number of shards the bot is running
 * @prop {String} password The password used to connect
 * @prop {Boolean} connected If it's connected to the node
 * @prop {Boolean} draining True if this node will no longer take new connections
 * @prop {Object} stats The Lavalink node stats
 */
class Lavalink extends EventEmitter {
	/**
	 * Lavalink constructor
	 * @param {Object} options Lavalink node options
	 * @param {String} options.host The hostname to connect to
     * @param {String} options.port The port to connect with
     * @param {String} options.region The region of the node
     * @param {Number} options.numShards The number of shards the bot is running
     * @param {String} options.userId The user id of the bot
     * @param {String} options.password The password for the Lavalink node
	 * @param {Number} [options.timeout=5000] Optional timeout in ms used for the reconnect backoff
	 */
	constructor(options) {
		super();

		this.host = options.host;
		this.port = options.port || 80;
		this.address = `ws://${this.host}:${this.port}`;
		this.region = options.region || null;
		this.userId = options.userId;
		this.numShards = options.numShards;
		this.password = options.password || 'youshallnotpass';
		this.connected = false;
		this.draining = false;
		this.retries = 0;
		this.reconnectTimeout = options.timeout || 5000;
		this.reconnectInterval = null;
		this.stats = { players: 0, playingPlayers: 0 };
		this.disconnectHandler = this.disconnected.bind(this);

		this.connect();
	}

	/**
	 * Connect to the websocket server
	 * @private
	 */
	connect() {
		this.ws = new WebSocket(this.address, {
			headers: {
				'Authorization': this.password,
				'Num-Shards': this.numShards,
				'User-Id': this.userId,
			},
		});

		this.ws.on('open', this.ready.bind(this));
		this.ws.on('message', this.onMessage.bind(this));
		this.ws.on('close', this.disconnectHandler);
		this.ws.on('error', (err) => {
			this.emit('error', err);
		});
	}

	/**
	 * Reconnect to the websocket
	 * @private
	 */
	reconnect() {
		let interval = this.retryInterval();
		this.reconnectInterval = setTimeout(this.reconnect.bind(this), interval);
		this.retries++;
		this.connect();
	}

	/**
	 * Destroy the websocket connection
	 */
	destroy() {
		if (this.ws) {
			this.ws.removeListener('close', this.disconnectHandler);
			this.ws.close();
		}
	}

	/**
	 * Called when the websocket is open
	 * @private
	 */
	ready() {
		if (this.reconnectInterval) {
			clearTimeout(this.reconnectInterval);
			this.reconnectInterval = null;
		}

		this.connected = true;
		this.retries = 0;
		this.emit('ready');
	}

	/**
	 * Called when the websocket disconnects
	 * @private
	 */
	disconnected() {
		this.connected = false;
		if (!this.reconnectInterval) {
			this.emit('disconnect');
		}

		delete this.ws;

		if (!this.reconnectInterval) {
			this.reconnectInterval = setTimeout(this.reconnect.bind(this), this.reconnectTimeout);
		}
	}

	/**
	 * Get the retry interval
	 * @private
	 */
	retryInterval() {
		let retries = Math.min(this.retries-1, 5);
		return Math.pow(retries + 5, 2) * 1000;
	}

	/**
	 * Send data to Lavalink
	 * @param {String} op Op name
	 * @param {*} data Data to send
	 */
	send(data) {
		const ws = this.ws;
		if (!ws) return;

		try {
			var payload = JSON.stringify(data);
		} catch (err) {
			return this.emit('error', 'Unable to stringify payload.');
		}

		ws.send(payload);
	}

	/**
	 * Handle message from the server
	 * @param {String} message Raw websocket message
	 * @private
	 */
	onMessage(message) {
		try {
			var data = JSON.parse(message);
		} catch (e) {
			return this.emit('error', 'Unable to parse ws message.');
		}

		if (data.op && data.op === 'stats') {
			this.stats = data;
		}

		this.emit('message', data);
	}
}

module.exports = Lavalink;
