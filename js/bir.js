
/* =============================== Bir JS =============================== */

// from https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript @lordvlad
hashCode = function(s){
  return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
}

function logError(err) {
	console.error("Error", err.toString());
}

/**
 * 
 * @param  {String}		The SocketIO server adresse
 * @param  {String}		The SocketIO servef Port
 * @param  {Object}		The Configuration of the iceServers
 * @param  {Function}	The hash function you whant to use (TODO)
 * @param  {String}		The SocketIO room you want to connect
 * @param  {Boolean}	The debug node
 * @return {Object}		himself
 */
function birJS(
	socketServer=window.location.host,
	socketPort='10542',
	configuration={'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]},
	hashFunction=hashCode,
	room=window.location.pathname,
	debug=false) {

	this.socketServer = socketServer;
	this.socketPort = socketPort;
	// this.socketServerPort = socketServer + ":" + socketPort;
	this.configuration = configuration;
	this.hashFunction = hashFunction;
	this.peers = [];
	this.datas = {};
	this.room=room;
	this.debug = debug;


	// Connection to the server socket IO
	// TODO: if socket io is not loaded, console error !
	this.socketIO = io.connect(socketServer + ":" + socketPort);

	/**
	 * Socket IO function when you just joined a room
	 * @param  {String}		The room joined
	 * @param  {String}		Your socket IO ID
	 * @param  {Object}		Socker IO ID of all other peers in the room
	 */
	socketIO.on('joined', function (room, clientId, clientsId) {
		this.debug ? console.log('I joined the SocketIO room: '  +  room + ' my ID:' + clientId + ' All ID:', clientsId):null;
		for (var i = 0; i < clientsId.length; i++) {
			this.debug ? console.log("connect to ", clientsId[i]):null;
			createPeerConnection(clientsId[i], this.configuration);
		}
	});

	/**
	  Socket IO function when you received a message from another client
	 * @param  {String}		Socket IO of the client who send the message
	 * @param  {String}		The message of the client
	 */
	socketIO.on('signalingMessage', function (id, message){
		this.debug ? console.log('Client >> received << signalingMessage:', id, message):null;
		signalingMessageCallback(id, message);
	});

	// Start: Join or create a room
	socketIO.emit('create_or_join', this.room);


	/**
	 * Create a Peer coonection with another brother
	 * @param  {string}		The sockeIO ID
	 * @param  {Object}		The config for the iceServers
	 * @return {int}		The new length property of the peers
	 */
	function createPeerConnection(IO_ID, config) {
		this.debug ? console.log('Creating Peer connection to ' + IO_ID  + ' config:', config):null;
		var newPeerConnection = new RTCPeerConnection(config);

		// send any ice candidates to the other peer
		newPeerConnection.onicecandidate = function (event) {
			// console.log('onIceCandidate event:', event);
			if (event.candidate) {
				sendSignalingMessage(IO_ID, {
					type: 'candidate',
					label: event.candidate.sdpMLineIndex,
					id: event.candidate.sdpMid,
					candidate: event.candidate.candidate
				});
			} else {
				this.debug ? console.log('End of candidates.'):null;
			}
		};

		this.debug ? console.log('Creating Data Channel'):null;
		dataChannel = newPeerConnection.createDataChannel("birJS");
		onDataChannelCreated(dataChannel);

		this.debug ? console.log('Creating an offer'):null;
		newPeerConnection.createOffer(function (datas){ onLocalSessionCreated(datas, IO_ID, newPeerConnection)}, logError);
		return this.peers.push({id: IO_ID, peer: newPeerConnection, channel: dataChannel});
	}

	/**
	 * Create the peer connection for the first time
	 * @param  {string}		The sockeIO ID
	 * @param  {Object}		The config for the iceServers
	 * @return {int}		The new length property of the peers
	 */
	function connectPeerConnection(IO_ID, config) {
		this.debug ? console.log('Connect Peer connection to ' + IO_ID  + ' config:', config):null;
		var newPeerConnection = new RTCPeerConnection(config);

		// send any ice candidates to the other peer
		newPeerConnection.onicecandidate = function (event) {
			if (event.candidate) {
				sendSignalingMessage(IO_ID, {
					type: 'candidate',
					label: event.candidate.sdpMLineIndex,
					id: event.candidate.sdpMid,
					candidate: event.candidate.candidate
				});
			} else {
				this.debug ? console.log('End of candidates.'):null;
			}
		};

		newPeerConnection.ondatachannel = function (event) {
			this.debug ? console.log('ondatachannel:', event.channel):null;
			onDataChannelCreated(event.channel);
			peer = peerFromID(IO_ID);
			if (peer) {
				peer.channel = event.channel;
			}
		};
		return this.peers.push({id: IO_ID, peer: newPeerConnection, channel: null});
	}


	/**
	 * get the data of an API from peers or server if no one have the data ask.
	 * Get the API from the server.
	 * @param  {string}		The url of the API you want to get
	 */
	function getDataFromAPI(url){
		var tmpxmlhttp = new XMLHttpRequest();
		thisParent = this;
		tmpxmlhttp.onreadystatechange = function() {
			if (this.readyState == 4 && this.status == 200) {
				var data = this.responseText;
				thisParent.datas[url] = data;
				this.debug ? console.log("onreadystatechange:", thisParent.datas, url, data):null;
    			thisParent.dispatchEvent(new CustomEvent('datas:' + url, {detail: {datas: data, from: "fromAPI"}}));
			}
		};
		tmpxmlhttp.open("GET", url, true);
		tmpxmlhttp.send();
	}

	/**
	 * Create and initialised channels for a peer.
	 * @param  {channel}	the channel of the peer
	 */
	function onDataChannelCreated(channel) {
		this.debug ? console.log('onDataChannelCreated:', channel):null;
		channel.onopen = function () {
			this.debug ? console.log('Channel opened.'):null;
		};
		channel.onmessage = message => {
			this.debug ? console.log("channel.onmessage :", message):null;
			data = message.data.split("_%_");
			if (data.length > 1 && data[0] == "noData"){
				getDataFromAPI(data[1]);
			} else if (data.length > 1 && data[0] == "giveData"){
				this.datas[data[1]] = data[2];
				this.dispatchEvent(new CustomEvent('datas:' + data[1], {detail: {datas: this.datas[data[1]], from: "fromPeer"}}));
			} else if (data.length > 1 && data[0] == "getDataNews"){
				if (this.datas.hasOwnProperty(data[1])) {
					channel.send("giveData" + "_%_" + data[1] + "_%_" + this.datas[data[1]]);
				} else {
					channel.send("noData" + "_%_" + data[1]);
				}
			}
		};
	}

	/**
	 * Send to a specifique client via socket IO a message.
	 * @param  {string}		The socket IO ID
	 * @param  {string}		The message you want to send
	 */
	function sendSignalingMessage(id, message){
		this.debug ? console.log('Client >> sending << to ' + id + ' signalingMessage: ', message):null;
		socketIO.emit('signalingMessage', id, message);
	}

	/**
	 * Received data from another client cia socket IO.
	 * @param  {string}		The socket IO ID of the sender
	 * @param  {string}		The message
	 */
	function signalingMessageCallback(id, message) {
		peer = peerFromID(id);
		if (!peer) {
			connectPeerConnection(id, configuration);
			peer = peerFromID(id);
			this.debug ? console.log("The peer is now created:", peer):null;
		}
		if (message.type === 'offer') {
			this.debug ? console.log('Got offer. Sending answer to peer.', id):null;
			peer.peer.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
			peer.peer.createAnswer(function (datas){onLocalSessionCreated(datas, peer.id, peer.peer)}, logError);
		} else if (message.type === 'answer') {
			this.debug ? console.log('Got answer.', id):null;
			peer.peer.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
		} else if (message.type === 'candidate') {
			this.debug ? console.log('Add ice candidate.', id):null;
			peer.peer.addIceCandidate(new RTCIceCandidate(message));
		} else if (message === 'bye') {
			// TODO: cleanup RTC connection
		}
	}

	/**
	 * Return the peer connection from his socketIO ID
	 * @param  {string}		The socket IO ID of the peer
	 * @return {peer}		The peer you ask for
	 */
	function peerFromID(id){
		for (var i = this.peers.length - 1; i >= 0; i--) {
			if (this.peers[i].id == id)
				return this.peers[i];
		}
		return null;
	}

	/**
	 * When a session is created with a peer.
	 * @param  {Object}		The description of the answer
	 * @param  {string}		The socket IO ID
	 * @param  {peer}		The peer
	 */
	function onLocalSessionCreated(desc, peerid, peer) {
		this.debug ? console.log('local session created:', desc, peerid, peer):null;
		peer.setLocalDescription(desc, function () {
			this.debug ? console.log('sending local desc:', peer.localDescription):null;
			sendSignalingMessage(peerid, peer.localDescription);
		}, logError);
	}

	// TODO
	this.send = function (data, peer) {
		console.log("TODO this.send",data, peer);
	}

	/**
	 * Give you the API data from server or peers.
	 * @param  {string}		The url of the API
	 * @param  {Function}	The callback function
	 * @param  {Function}	TODO :: The hash function you used
	 */
	this.get = function (url, callback, hash=null){
		this.debug ? console.log("this.get", url):null;
		var event = new Event('datas:' + url);
		//get from url check hash with server if come frome other client
		this.addEventListener('datas:' + url, function (event){
			this.debug ? console.log("<======> <======> <======> <======>", event):null;
			callback(event.detail.datas, event.detail.from);
		});
		for (var i = 0; i < this.peers.length; i++) {
			if (this.peers[i].channel) {
				this.peers[i].channel.send("getDataNews_%_"+url);
				return ;
			}
		}
		getDataFromAPI(url);
		// callback(this.datas, "nobody");
	}
	/**
	 * Return to you the list of all peers you are connected to.
	 * @return {peers[]}	the list of all peers
	 */
	this.getPeers = function () {
		this.debug ? console.log("this.getPeers"):null;
		return this.peers;
	}
	/**
	 * Return the datas you stock.
	 * @return {Object}		All datas
	 */
	this.getDatas = function () {
		this.debug ? console.log("this.getDatas"):null;
		return this.datas;
	}
	/**
	 * Help to debug, you can set the debug to true or false
	 * @param {bool}		The debug value
	 */
	this.setDebug = function (debug) {
		this.debug = debug;
	}

	// TODO
	/**
	 * Remove the data from a specifique url
	 * @param  {string}		the url you whant to remove
	 * @return {bool}		True if the data existe and have been delete else false
	 */
	this.resetData = function(url) {
		console.log("TODO this.resetData",data, peer);
		// reset data of a specifique data
	}

	return this;
}