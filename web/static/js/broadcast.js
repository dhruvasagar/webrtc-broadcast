import {Socket} from "phoenix"
let socket = new Socket("/socket")

$(document).ready(function() {

  var sdpConstraints = {video: false, audio: true}

  socket.connect()

  var chan,
      stream,
      yourConnection,
      connections = {},
      isBroadcaster = window.roomName == undefined

  window.connections = connections

  var name = window.roomName, channelName

  function uniqueToken() {
    var s4 = function() {
      return Math.floor(Math.random() * 0x10000).toString(16)
    }
    return s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4()
  }

  // Alias for sending messages in JSON format
  function send(message) {
    chan.push("client:webrtc-" + channelName, message)
  }

  function onBroadcast(success) {
    if (success === false) {
      alert("Broadcast unsuccessful, please try a different room name.")
    } else {
      var url = window.location.host + '/' + name
      $(roomDetails).html("Share the url with ur listeners: <a href=//" + url + ">" + url + "</a>")

      broadcastButton.disabled = true
      hangUpButton.disabled = false

      // Get the plumbing ready for a call
      startConnection()
    }
  }

  function onConnected(success) {
    if (success === false) {
      alert("Unable to join, please check the room name.")
    } else {
      joinButton.disabled = true
      hangUpButton.disabled = false

      setupPeerConnection()
      requestPeerConnection()
    }
  }

  function onOffer(offer, name) {
    yourConnection.setRemoteDescription(new RTCSessionDescription(offer))

    yourConnection.createAnswer(function (answer) {
      yourConnection.setLocalDescription(answer)
      send({
        name: name,
        type: "answer",
        answer: answer
      })
    }, function (error) {
      send({
        type: "error",
        message: "onOffer error: " + error
      })
      console.log("onOffer error", error)
    })
  }

  function onAnswer(answer, name) {
    var connection = connections[name]
    connection.setRemoteDescription(new RTCSessionDescription(answer))
  }

  function onCandidate(candidate) {
    yourConnection.addIceCandidate(new RTCIceCandidate(candidate))
  }

  function onPeerCandidate(candidate, name) {
    var connection = connections[name]
    connection.addIceCandidate(new RTCIceCandidate(candidate))
  }

  function onLeave() {
    yourConnection.close()
    yourConnection.onicecandidate = null
    yourConnection.onaddstream = null
  }

  function onPeerLeave(name) {
    var connection = connections[name]
    connection.close()
    connection.onicecandidate = null
    connection.onaddstream = null
  }

  function closeAllPeers() {
    for (var name in connections) {
      var connection = connections[name]
      connection.close()
      connection.onicecandidate = null
      connection.onaddstream = null
    }
  }

  function stopStream() {
    stream.getAudioTracks().forEach((track) => track.stop())
  }

  function hasUserMedia() {
    return !!navigator.mediaDevices.getUserMedia
  }

  function hasRTCPeerConnection() {
    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection
    window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription
    window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate
    return !!window.RTCPeerConnection
  }

  function startConnection() {
    if (hasUserMedia()) {
      navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        .then(function (myStream) {
          stream = myStream

          if (hasRTCPeerConnection()) {
            setupPeerConnection(stream)
          } else {
            send({
              type: "error",
              message: "Sorry, your browser does not support WebRTC."
            })
            alert("Sorry, your browser does not support WebRTC.")
          }
        })
        .catch(function (error) {
          send({
            type: "error",
            message: "Sorry, your browser does not support WebRTC."
          })
          console.log(error)
        })
    } else {
      send({
        type: "error",
        message: "Sorry, your browser does not support WebRTC."
      })
      alert("Sorry, your browser does not support WebRTC.")
    }
  }

  function createBroadcasterPeerConnection(name) {
    var configuration = {
      "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
    }
    var connection = new RTCPeerConnection(configuration)
    connection.addStream(stream)

    // Setup ice handling
    connection.onicecandidate = function (event) {
      console.log("On ICE Candidate")
      if (event.candidate) {
        send({
          name: name,
          type: "candidate",
          candidate: event.candidate
        })
      }
    }

    connections[name] = connection
  }

  function setupPeerConnection(stream) {
    console.log("Setting up RTCPeerConnection")
    var configuration = {
      "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
    }
    yourConnection = new RTCPeerConnection(configuration)
    window.connection = yourConnection

    // Setup stream listening
    if (isBroadcaster) {
      console.log("Adding local stream")
      yourConnection.addStream(stream)
    } else {
      yourConnection.onaddstream = function (e) {
        console.log("On Add Stream Fired")
        var theirAudio = document.querySelector('#theirs')
        if (theirAudio) {
          theirAudio.src = window.URL.createObjectURL(e.stream)
        }
      }
    }

    // Setup ice handling
    yourConnection.onicecandidate = function (event) {
      console.log("On ICE Candidate")
      if (event.candidate) {
        send({
          name: name,
          type: "candidate",
          candidate: event.candidate
        })
      }
    }
  }

  function requestPeerConnection() {
    send({
      name: name,
      type: "stream-request"
    })
  }

  function startPeerConnection(name) {
    // Begin the offer
    var connection = connections[name]
    connection.createOffer(function (offer) {
      console.log("Createing Offer to ", name)
      send({
        name: name,
        type: "offer",
        offer: offer
      })
      connection.setLocalDescription(offer)
    }, function (error) {
      send({
        type: "error",
        message: "startPeerConnection error" + error
      })
      console.log("An error has occurred.")
    })
  }

  var hangUpButton = document.querySelector('#hangup')
  hangUpButton.disabled = true
  hangUpButton.addEventListener("click", function () {
    send({
      name: name,
      type: "leave"
    })

    onLeave()

    if (isBroadcaster) {
      closeAllPeers()
      stopStream()
    }

    if (broadcastButton) {
      broadcastButton.disabled = false
    }
    if (joinButton) {
      joinButton.disabled = false
    }
    hangUpButton.disabled = true
  })

  if (isBroadcaster) {
    // Broadcastor
    var roomNameInput = document.querySelector('#room-name'),
        broadcastButton = document.querySelector('#broadcast'),
        roomDetails = document.querySelector('#room-details')

    broadcastButton.addEventListener('click', (event) => {
      name = roomNameInput.value
      channelName = name
      window.roomName = name

      if (name.length > 0) {
        chan = socket.channel("webrtc:client-"+channelName, {})

        chan.join()
          .receive("ok", resp => { onBroadcast(true) })
          .receive("error", resp => { onBroadcast(false) })

        chan.on("webrtc:login", data => {
          console.log("Got login", data)
          onBroadcast(data.success)
        })

        chan.on("webrtc:stream-request", data => {
          console.log("Got stream request", data)
          createBroadcasterPeerConnection(data.name)
          startPeerConnection(data.name)
        })

        chan.on("webrtc:answer", data => {
          console.log("Got answer", data)
          onAnswer(data.answer, data.name)
        })

        chan.on("webrtc:candidate", data => {
          console.log("Got candidate", data)
          onPeerCandidate(data.candidate, data.name)
        })

        chan.on("webrtc:leave", data => {
          console.log("Got leave", data)
          onPeerLeave(data.name)
        })
      }
    })
  } else {

    var theirAudio = document.querySelector('#theirs'),
        joinButton = document.querySelector('#join')

    joinButton.addEventListener('click', (event) => {
      channelName = uniqueToken()
      chan = socket.channel("webrtc:client-"+channelName, {})

      chan.join()
        .receive("ok", resp => { onConnected(true) })
        .receive("error", resp => { onConnected(false) })

      chan.on("webrtc:login", data => {
        console.log("Got login", data)
        onConnected(data.success)
      })

      chan.on("webrtc:offer", data => {
        console.log("Got offer", data)
        onOffer(data.offer, data.name)
      })

      chan.on("webrtc:candidate", data => {
        console.log("Got candidate", data)
        onCandidate(data.candidate)
      })

      chan.on("webrtc:leave", data => {
        console.log("Got leave", data)
        onLeave()
      })
    })
  }
})
