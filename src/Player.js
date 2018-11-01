const Constants = require('eris').Constants;

var EventEmitter;

try {
    EventEmitter = require('eventemitter3');
} catch (err) {
    EventEmitter = require('events').EventEmitter;
}

 /**
 * @typedef {import('./PlayerManager')} PlayerManager
 * @typedef {import('./Lavalink')} Lavalink
 */

/** @typedef {Object} BandSettings
 * @prop {Number} band The band to change, it ranges from `0` to `14`, 0 being lowest frequency
 * @prop {Number} gain The gain to apply to the band, ranges from `-0.25` to `1.0`, `-0.25` effectively muting the band, and `0.25` doubling it
 */

/**
 * Represents a player/voice connection to Lavalink
 * @extends EventEmitter
 * @prop {String} id Guild id for the player
 * @prop {PlayerManager} manager Reference to the player manager
 * @prop {Lavalink} node Lavalink node the player is connected to
 * @prop {Object} shard The eris shard the player is associated with
 * @prop {String} hostname Hostname of the lavalink node
 * @prop {String} guildId Guild ID
 * @prop {String} channelId Channel ID
 * @prop {Boolean} ready If the connection is ready
 * @prop {Boolean} playing If the player is playing
 * @prop {Object} state The lavalink player state
 * @prop {Number} state.position The position in milliseconds on the current track playback
 * @prop {Number} state.time The timestamp at which latest state update from lavalink was received
 * @prop {String} track The encoded identifier of the currently playing track
 */
class Player extends EventEmitter {
    /**
     * Player constructor
     * @param {String} id Guild ID
     * @param {Object} data Player data
     * @param {String} data.channelId The channel id of the player
     * @param {String} data.guildId The guild id of the player
     * @param {String} data.hostname The hostname of the lavalink node
     * @param {PlayerManager} data.manager The PlayerManager associated with this player
     * @param {Lavalink} data.node The Lavalink node associated with this player
     * @param {Shard} data.shard The eris shard associated with this player
     * @param {Object} [data.options] Additional passed from the user to the player
     */
    constructor(id, { hostname, guildId, channelId, shard, node, manager, options }) {
        super();
        this.id = id;
        this.node = node;
        this.hostname = hostname;
        this.guildId = guildId;
        this.channelId = channelId;
        this.manager = manager || null;
        this.options = options;
        this.ready = false;
        this.playing = false;
        this.paused = false;
        this.shard = shard;
        this.state = {};
        this.track = null;
        this.sendQueue = [];
        this.timestamp = Date.now();
    }

    /**
     * Check the event queue
     * @private
     */
    checkEventQueue() {
        if (this.sendQueue.length > 0) {
            let event = this.sendQueue.splice(0,1);
            this.sendEvent(event[0]);
        }
    }

    /**
     * Queue an event to be sent to Lavalink
     * @param {*} data The payload to queue
     * @private
     */
    queueEvent(data) {
        if (this.sendQueue.length > 0) {
            this.sendQueue.push(data);
        } else {
            return this.sendEvent(data);
        }
    }

    /**
     * Send a payload to Lavalink
     * @param {*} data The payload to send
     * @private
     */
    async sendEvent(data) {
        this.node.send(data);
        process.nextTick(() => this.checkEventQueue());
    }

    /**
     * Connect to the Lavalink node
     * @param {Object} data The data used to connect
     * @param {String} data.guildId The guild ID to connect
     * @param {String} data.sessionId The voice connection session ID
     * @param {Object} data.event The event data from the voice server update
     * @returns {void}
     */
    connect(data) {
        this.emit('connect');
        this.queueEvent({
            op: 'voiceUpdate',
            guildId: data.guildId,
            sessionId: data.sessionId,
            event: data.event,
        });

        process.nextTick(() => this.emit('ready'));
    }

    /**
     * Disconnect from Lavalink
     * @param {*} [msg] An optional disconnect message
     * @returns {void}
     */
    disconnect(msg) {
        this._disconnect();
        this.emit('disconnect', msg);
    }

    _disconnect() {
        this.playing = false;

        if (this.paused) {
            this.resume();
        }

        this.queueEvent({ op: 'destroy', guildId: this.guildId });

        this.stop();
    }

    /**
     * Play a Lavalink track
     * @param {String} track The track to play
     * @param {Object} [options] Optional options to send
     * @returns {void}
     */
    play(track, options) {
        this.lastTrack = this.track;
        this.track = track;
        this.playOptions = options;

        if (this.node.draining) {
            this.state.position = 0;
            return this.manager.switchNode(this);
        }

        let payload = Object.assign({
            op: 'play',
            guildId: this.guildId,
            track: track,
        }, options);

        this.queueEvent(payload);
        this.playing = !this.paused;
        this.timestamp = Date.now();
    }

    /**
     * Stop playing
     * @returns {void}
     */
    stop() {
        let payload = {
            op: 'stop',
            guildId: this.guildId,
        };

        this.queueEvent(payload);
        this.playing = false;
        this.lastTrack = this.track;
        this.track = null;
    }

    /**
     * Update player state
     * @param {Object} state The state object received from Lavalink
     * @private
     */
    stateUpdate(state) {
        this.state = state;
    }

    /**
     * Used to pause/resume the player
     * @param {Boolean} pause Set pause to true/false
     * @returns {void}
     */
    setPause(pause) {
        this.node.send({
            op: 'pause',
            guildId: this.guildId,
            pause: pause,
        });

        this.paused = pause;
        this.playing = !pause;
    }

    /**
     * 
     * @param {Array<BandSettings>} bands The bands to edit
     * @returns {void}
     */
    setEqualizer(bands) {
        this.node.send({
            op: 'equalizer',
            guildId: this.guildId,
            bands
        });
    }

    /**
     * Destroy the player, may be used to move a player to another node
     * @returns {void}
     */
     destroy() {
        this.node.send({
            op: 'destroy',
            guildId: this.guildId
        });
    }

    /**
     * Used to pause the player
     */
    pause() {
        if (this.playing) {
            this.setPause(true);
        }
    }

    /**
     * Used to resume the player
     */
    resume() {
        if (!this.playing && this.paused) {
            this.setPause(false)
        }
    }

    /**
     * Used for seeking to a track position
     * @param {Number} position The position to seek to
     * @returns {void}
     */
    seek(position) {
        this.node.send({
            op: 'seek',
            guildId: this.guildId,
            position: position,
        });
    }

    /**
     * Set the volume of the player
     * @param {Number} volume The volume level to set
     * @returns {void}
     */
    setVolume(volume) {
        this.node.send({
            op: 'volume',
            guildId: this.guildId,
            volume: volume,
        });
    }

    /**
     * Called on track end
     * @param {Object} message The end reason
     * @private
     */
    onTrackEnd(message) {
        if (message.reason !== 'REPLACED') {
            this.playing = false;
            this.lastTrack = this.track;
            this.track = null;
        }
        this.emit('end', message);
    }

    /**
     * Called on track exception
     * @param {Object} message The exception encountered
     * @private
     */
    onTrackException(message) {
        this.emit('error', message);
    }

    /**
     * Called on track stuck
     * @param {Object} message The message if exists
     * @private
     */
    onTrackStuck(message) {
        this.stop();
        process.nextTick(() => this.emit('end', message));
    }

    /**
     * Switch voice channel
     * @param {String} channelId Called when switching channels
     * @param {Boolean} [reactive] Used if you want the bot to switch channels
     * @returns {void}
     */
    switchChannel(channelId, reactive) {
        if(this.channelId === channelId) {
            return;
        }

        this.channelId = channelId;
        if (reactive === true) {
            this.updateVoiceState(channelId);
        }
    }

    getTimestamp() {
        return Date.now() - this.timestamp;
    }

    /**
     * Update the bot's voice state
     * @param {Boolean} selfMute Whether the bot muted itself or not (audio sending is unaffected)
     * @param {Boolean} selfDeaf Whether the bot deafened itself or not (audio receiving is unaffected)
     * @private
     */
    updateVoiceState(channelId, selfMute, selfDeaf) {
        if (this.shard.sendWS) {
            this.shard.sendWS(Constants.GatewayOPCodes.VOICE_STATE_UPDATE, {
                guild_id: this.id === 'call' ? null : this.id,
                channel_id: channelId || null,
                self_mute: !!selfMute,
                self_deaf: !!selfDeaf,
            });
        }
    }
}

module.exports = Player;
