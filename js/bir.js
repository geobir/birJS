
/* =============================== Bir JS =============================== */

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
 * @param  {String}		The way to save [indexedDB{default}, localStorage] datas
 * @param  {Boolean}	The debug node
 * @return {Object}		himself
 */
function birJS(
	socketServer=window.location.host,
	socketPort='10542',
	configuration={'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]},
	// hashFunction=hashCode,
	room=window.location.pathname,
	save="indexedDB",
	debug=false) {

	this.socketServer = socketServer;
	this.socketPort = socketPort;
	this.configuration = configuration;
	// this.hashFunction = hashFunction;
	this.peers = [];
	this.datas = [];
	this.room = room;
	this.saveDB = save;
	this.debug = debug;
	this.isWebRTCReady = false
	this.sizeOfChunk = 10 * 256; // in KB
	// DB
	this.dbName = "birJS";
	this.dataBase = null;
	this.db = null;
	this.objectStore = null;


	/**
	 * Init function
	 */
	function init() {
		window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
		window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;
		// if the IndexedDB is the default save but the browser dosen't support it
		if (this.saveDB == "indexedDB" && !window.indexedDB || !window.IDBTransaction) {
			this.saveDB = "localStorage";
		}
		// invi of indexedDB
		if (this.saveDB == "indexedDB") {
			this.dataBase = window.indexedDB.open(this.dbName, 1);
			thisParent = this;
			this.dataBase.onsuccess = function (evt) {
				thisParent.db = thisParent.dataBase.result;
			};

			this.dataBase.onerror = function (evt) {
				console.log("IndexedDB error: " + evt.target.errorCode);
				thisParent.save = "localStorage";
			};

			this.dataBase.onupgradeneeded = function (evt) {
				thisParent.objectStore = evt.currentTarget.result.createObjectStore("data", { keyPath: "id"});

				thisParent.objectStore.createIndex("data", "data", { unique: false });
				thisParent.objectStore.createIndex("hash", "hash", { unique: true });

			};
		}
		// check if socket IO is loaded
		if (typeof(io) != 'undefined') {
			// Connection to the server socket IO
			this.socketIO = io.connect(socketServer + ":" + socketPort);
		}
	}

	init();


	/**
	 * Socket IO function when you just joined a room
	 * @param  {String}		The room joined
	 * @param  {String}		Your socket IO ID
	 * @param  {Object}		Socker IO ID of all other peers in the room
	 */
	socketIO.on('joined', function (room, clientId, clientsId) {
		this.debug ? console.log('I joined the SocketIO room: '  +  room + ' my ID:' + clientId + ' All ID:', clientsId) : null;
		for (var i = 0; i < clientsId.length; i++) {
			this.debug ? console.log("connect to ", clientsId[i]) : null;
			createPeerConnection(clientsId[i], this.configuration);
		}
	});

	/**
	  Socket IO function when you received a message from another client
	 * @param  {String}		Socket IO of the client who send the message
	 * @param  {String}		The message of the client
	 */
	socketIO.on('signalingMessage', function (id, message) {
		this.debug ? console.log('Client >> received << signalingMessage:', id, message) : null;
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
		this.debug ? console.log('Creating Peer connection to ' + IO_ID  + ' config:', config) : null;
		var newPeerConnection = new RTCPeerConnection(config);

		onIceCandidate(newPeerConnection, IO_ID);

		this.debug ? console.log('Creating Data Channel') : null;
		dataChannel = newPeerConnection.createDataChannel("birJS");
		onDataChannelCreated(dataChannel);

		this.debug ? console.log('Creating an offer') : null;
		newPeerConnection.createOffer(function (datas) { onLocalSessionCreated(datas, IO_ID, newPeerConnection)}, logError);
		return this.peers.push({id: IO_ID, peer: newPeerConnection, channel: dataChannel, datas:[]});
	}

	/**
	 * Create the peer connection for the first time
	 * @param  {string}		The sockeIO ID
	 * @param  {Object}		The config for the iceServers
	 * @return {int}		The new length property of the peers
	 */
	function connectPeerConnection(IO_ID, config) {
		this.debug ? console.log('Connect Peer connection to ' + IO_ID  + ' config:', config) : null;
		var newPeerConnection = new RTCPeerConnection(config);

		onIceCandidate(newPeerConnection, IO_ID);

		newPeerConnection.ondatachannel = function (event) {
			this.debug ? console.log('ondatachannel:', event.channel) : null;
			onDataChannelCreated(event.channel);
			peer = this.getPeer(IO_ID);
			if (peer) {
				peer.channel = event.channel;
			}
			this.isWebRTCReady = true;
			if (this.datas.length > 0) {
				event.channel.send("haveData" + "_%_" + this.datas.join("_%_"));
			}
		};
		return this.peers.push({id: IO_ID, peer: newPeerConnection, channel: null, datas:[]});
	}

	/**
	 * Create a onIceCandidate for peer
	 * @param  {Object} peer The targeted peer
	 * @param  {String} ID   His ID
	 */
	function onIceCandidate(peer, ID) {
		peer.onicecandidate = function(event) {
			this.debug ? console.log('>> onicecandidate', event) : null;
			if (event.candidate) {
				sendSignalingMessage(ID, {
					type: 'candidate',
					label: event.candidate.sdpMLineIndex,
					id: event.candidate.sdpMid,
					candidate: event.candidate.candidate
				});
				this.isWebRTCReady = true;
			} else {
				this.debug ? console.log('End of candidates.') : null;
			}
		}
	}

	/**
	 * Get the data from an URL.
	 * @param  {string}		The url of the URL you want to get in binnary
	 */
	function getDataFromURL(url) {
		var tmpxmlhttp = new XMLHttpRequest();
		thisParent = this;
		this.debug ? console.log("====== ><><>>< Data ask to the URL ><><><>< ======") : null;
		tmpxmlhttp.onerror = function(e) { console.error("Error in loading data from url:", url, e); };
		tmpxmlhttp.onload = function(e) {
			if (this.status == 200) {
				var uInt8Array = new Uint8Array(this.response);
				var i = uInt8Array.length;
				var biStr = new Array(i);
				while (i-- > 0) {
					biStr[i] = String.fromCharCode(uInt8Array[i]);
				}
				var data = biStr.join('');
				thisParent.save(url, data);
				thisParent.sendToPeers("haveData" + "_%_" + url);
     			thisParent.dispatchEvent(new CustomEvent('datas:' + url, {detail: {datas: data, from: "fromURL"}}));
     			tmpxmlhttp.onerror = function(e) { console.error("Error in loading data from url:", url, e); };
			}
		};
		tmpxmlhttp.open("GET", url, true);
		tmpxmlhttp.responseType = 'arraybuffer';
		tmpxmlhttp.send();
	}

	/**
	 * Create and initialised channels for a peer.
	 * @param  {channel}	the channel of the peer
	 */
	function onDataChannelCreated(channel) {
		this.debug ? console.log('onDataChannelCreated:', channel) : null;
		channel.onopen = function () {
			this.debug ? console.log('Channel opened.') : null;
		};
		channel.onmessage = message => {
			this.debug ? console.log("channel.onmessage :", message) : null;
			data = message.data.split("_%_");
			if (data.length > 1 && data[0] == "noData") {
				// if the peer do not have this data remove from the list
				peerData = this.getPeerFromChannel(channel).datas;
				if (peerData.indexOf(data[1]) >= 0) {
					peerData.splice(peerData.indexOf(data[1]), 1);
				}
				// TODO check if another peer can share.
				getDataFromURL(data[1]);
			} else if (data.length > 1 && data[0] == "giveData") {
				if (data.length > 3) {
					data[2] = parseFloat(data[2]);
					data[3] = parseInt(data[3]);
					this.debug ? console.log("giveData Chunk :", data[4].length, data[1], data[2], this.sizeOfChunk, data[3]) : null;
					this.saveChunk(data[1], data[4], (data[2] * this.sizeOfChunk), data[3]);
					// /!\ /!\ /!\ If all chunks of data come from multiple peers, the condition need to be rewrite.
					if (data[2] <= data[3] + 1) {
						this.sendToPeers("haveData" + "_%_" + data[1]);
						this.dispatchEvent(new CustomEvent('datas:' + data[1], {detail: {datas: this.getLocal(data[1]), from: "fromPeer"}}));
					}
				} else {
					this.debug ? console.log("giveData :", data[1], data[2][0], data[2].length) : null;
					this.save(data[1], data[2]);
					this.sendToPeers("haveData" + "_%_" + data[1]);
					this.dispatchEvent(new CustomEvent('datas:' + data[1], {detail: {datas: this.getLocal(data[1]), from: "fromPeer"}}));
				}
			} else if (data.length > 1 && data[0] == "haveData") {
				for (var i = 1; i < data.length; i++) {
					this.getPeerFromChannel(channel).datas.push(data[i]);
				}
			} else if (data.length > 1 && data[0] == "removeMyData") {
				peer = this.getPeerFromChannel(channel);
				index = peer.datas.indexOf(data[1]);
				if (index >= 0) {
					peer.datas.splice(index);
				}
			} else if (data.length > 1 && data[0] == "getDataNews") {
				if (this.getLocal(data[1])) {
					this.debug ? console.log("getDataNews :", data[1]) : null;
					// The All Data to send
					dataToSend = this.getLocal(data[1]);
					// If the Data to send is to big for the webRTC Channel, we need to cut in chunk
					if (dataToSend.length > this.sizeOfChunk) {
						numOfChunk = (dataToSend.length / this.sizeOfChunk);
						for (var i = 0; i < numOfChunk; i++) {
							chunkToSend = dataToSend.substring(i * this.sizeOfChunk, (i + 1) * this.sizeOfChunk);
							this.debug ? console.log("SEND CHUNK: >>> ", numOfChunk, dataToSend.length, i, this.sizeOfChunk, chunkToSend.length) : null;
							channel.send("giveData" + "_%_" + data[1] + "_%_" + numOfChunk + "_%_" + i + "_%_" + chunkToSend);
						}
					} else {
						channel.send("giveData" + "_%_" + data[1] + "_%_" + dataToSend);
					}
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
	function sendSignalingMessage(id, message) {
		this.debug ? console.log('Client >> sending << to ' + id + ' signalingMessage: ', message) : null;
		socketIO.emit('signalingMessage', id, message);
	}

	/**
	 * Received data from another client cia socket IO.
	 * @param  {string}		The socket IO ID of the sender
	 * @param  {string}		The message
	 */
	function signalingMessageCallback(id, message) {
		peer = this.getPeer(id);
		if (!peer) {
			connectPeerConnection(id, configuration);
			peer = this.getPeer(id);
			this.debug ? console.log("The peer is now created:", peer) : null;
		}
		if (message.type === 'offer') {
			this.debug ? console.log('Got offer. Sending answer to peer.', id) : null;
			peer.peer.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
			peer.peer.createAnswer(function (datas) {onLocalSessionCreated(datas, peer.id, peer.peer)}, logError);
		} else if (message.type === 'answer') {
			this.debug ? console.log('Got answer.', id) : null;
			peer.peer.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
		} else if (message.type === 'candidate') {
			this.debug ? console.log('Add ice candidate.', id) : null;
			peer.peer.addIceCandidate(new RTCIceCandidate(message));
		} else if (message === 'bye') {
			// TODO: cleanup RTC connection
		}
	}

	/**
	 * When a session is created with a peer.
	 * @param  {Object}		The description of the answer
	 * @param  {string}		The socket IO ID
	 * @param  {peer}		The peer
	 */
	function onLocalSessionCreated(desc, peerid, peer) {
		this.debug ? console.log('local session created:', desc, peerid, peer) : null;
		peer.setLocalDescription(desc, function () {
			this.debug ? console.log('sending local desc:', peer.localDescription) : null;
			sendSignalingMessage(peerid, peer.localDescription);
		}, logError);
	}

	/**
	 * Sending datas to a peer
	 * @param  {Object} peer The peer targeted
	 * @param  {String} data the string you want to send
	 */
	this.sendToPeer = function (peer, data) {
		if (this.isWebRTCReady) {
			peer.channel.send(data);
		}
	}
	/**
	 * Sending datas to all peers
	 * @param  {String} data the string you want to send
	 */
	this.sendToPeers = function (data) {
		if (this.isWebRTCReady) {
			for (var i = 0; i < this.peers.length; i++) {
				if(this.peers[i].channel && this.peers[i].channel.readyState == 'open') {
					this.peers[i].channel.send(data);
				}
			}
		}
	}

	/**
	 * Give you the data of the URL from server or peers.
	 * @param  {string}		url			The url
	 * @param  {Function}	callback	The callback function who will received the binnary answer
	 * @param  {Function}	hash		TODO :: The hash function you used
	 */
	this.get = function (url, callback, hash=null) {
		this.debug ? console.log("this.get", url) : null;
		
		// TODO check timeline / Hash of data
		if (this.hasLocal(url)) {
			this.getLocal(url, callback)
			// callback(url, this.getLocal(url), "fromMe");
		} else {
			var event = new Event('datas:' + url);
			this.addEventListener('datas:' + url, function (event) {
				this.debug ? console.log("datas", event) : null;
				callback(url, event.detail.datas, event.detail.from);
			});
			// if WebRTC is ready
			if (this.isWebRTCReady) {
				for (var i = 0; i < this.peers.length; i++) {
					this.debug ? console.log("peer", this.peers[i], url, this.peers[i].channel && this.peers[i].channel.readyState == 'open' && this.peers[i].datas.includes(url)) : null;
					if (this.peers[i].channel && this.peers[i].channel.readyState == 'open' && this.peers[i].datas.includes(url)) {
						this.debug ? console.log("======================== ><><>>< Data Found from peer ><><><>< ========================") : null;
						this.peers[i].channel.send("getDataNews" + "_%_" + url);
						return ;
					}
				}
			}
			getDataFromURL(url);
		}
	}

	/**
	 * Get the local data with the key
	 * @param  {String} key The key of the data you want, basicly the url
	 * @return {String}     The data you ask for
	 */
	this.getLocal = function(key, callback) {
		this.debug ? console.log("this.getLocal", key) : null;
		if (this.saveDB == "indexedDB") {
			console.log("this.getLocal", key);
			var transaction = this.db.transaction("data");
			var objectStore = transaction.objectStore("data");
			var request = objectStore.get(key);
			request.onsuccess = function(evt) {
				callback(key, request.result.data, "fromMe");
			};
		} else {
			return localStorage[key];
		}
	}


	/**
	 * Return true if tyou have localy the Data
	 * @param  {String} key The key of the data you want, basicly the url
	 * @return {Boolean}     True if the data is store localy, else false
	 */
	this.hasLocal = function(key) {
		this.debug ? console.log("this.hasLocal", key, this.datas.includes(key)) : null;
		if (this.datas.includes(key)) {
			return true
		}
		return false;
	}


	/**
	 * Get a chunk of local data with the key
	 * @param  {String} key 	The key of the data you want, basicly the url
	 * @param  {Int} 	i 		The chunk you want
	 * @param  {Int} 	size	The size of each chunk
	 * @return {String}     	The data you ask for
	 */
	this.getLocalChunk = function(key, i, size) {
		console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
		this.debug ? console.log("this.getLocalChunk", key, this.datas.includes(key)) : null;
		return this.getLocal(key).substring(i * size, size)
	}

	/**
	 * Get the lenght of a data with the key
	 * @param  {String} key The key of the data you want, basicly the url
	 * @return {Int}     	The length of the data
	 */
	// this.getLenghtOfData = function(key) {
	// 	return this.datas[key] = data.length;
	// }

	/**
	 * Save data with the good methode
	 * @param  {String} key  The key of the data, basicly the url
	 * @param  {String} data The data
	 */
	this.save = function(key, data) {
		if (this.saveDB = "indexedDB") {
			console.log(this.dbName, this.db);
			var transaction = this.db.transaction("data", "readwrite");
			var objectStore = transaction.objectStore("data");
			var request = objectStore.add({id: key, data: data});
			thisParent = this;
			request.onsuccess = function (evt) {
				thisParent.datas.push(key);
				console.log("succeeded to save in the DB");
			};
		} else {
			if (this.datas.indexOf(key) == -1) {
				this.datas.push(key);
			}
			localStorage[key] = data;
		}
	}


	/**
	 * Save only part of data
	 * @param  {String} key  	The key of the data, basicly the url
	 * @param  {String} data 	The data
	 * @param  {Int} 	length 	The lenght of the final data
	 * @param  {Int} 	i      	Where the data need to be write
	 */
	this.saveChunk = function(key, data, length, i) {
		this.getLocal(key, function(tmp) {
			if (!tmp || tmp.length != length) {
				tmp = new Array(length + 1).join(" ");
			}
			tmp2 = tmp.substr(0, i * this.sizeOfChunk) + data;
			if ((i + 1) * this.sizeOfChunk < length) {
				tmp2 += tmp.substr((i + 1) * this.sizeOfChunk);
			}
			this.save(key, tmp2);
		});
	}

	/**
	 * Return to you the list of all peers you are connected to.
	 * @return {Array}		the list of all peers
	 */
	this.getPeers = function () {
		this.debug ? console.log("this.getPeers") : null;
		return this.peers;
	}

	/**
	 * Return the peer from his socketIO ID
	 * @param  {String}		The socket IO ID of the peer
	 * @return {Array}		The peer you ask for
	 */
	this.getPeer = function (id) {
		for (var i = this.peers.length - 1; i >= 0; i--) {
			if (this.peers[i].id == id) {
				return this.peers[i];
			}
		}
		return null;
	}

	/**
	 * Get a peer from the channel
	 * @param  {Object} channel The channel of the targeted peer
	 * @return {Array}			The peer you ask for
	 */
	this.getPeerFromChannel = function (channel) {
		for (var i = this.peers.length - 1; i >= 0; i--) {
			if (this.peers[i].channel == channel) {
				return this.peers[i];
			}
		}
		return null;
	}

	/**
	 * Help to debug, you can set the debug to true or false
	 * @param {bool}		The debug value
	 */
	this.setDebug = function (debug) {
		this.debug = debug;
	}

	/**
	 * Remove the data
	 * @param  {string}		the url you whant to remove
	 * @return {bool}		True if the data existe and have been delete else false
	 */
	this.removeData = function(url) {
		delete localStorage[url] || this.datas[url];
		this.sendToPeers("removeMyData" + "_%_" + url);
	}

	return this;
}
