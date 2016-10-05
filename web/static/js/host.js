import socket from "./socket"

socket.connect()

var chan,
    stream,
    roomName,
    connections = {}

function send(message) {
  chan.push('client:webrtc-' + roomName, message)
}

function onConnected(success) {
  if (success) {
    var roomDetailsForSharing = document.querySelector('#room-details')
    var url = window.location.host + '/' + roomName
    roomDetailsForSharing.innerHTML = 'Share the url with ur listeners: <a href=//' + url + '>' + url + '</a>'

    var hangUpButton = document.querySelector('#hangup'),
        broadcastButton = document.querySelector('#broadcast')

    hangUpButton.disabled = false
    broadcastButton.disabled = true

    getStream()
  }
}

function onAnswer(data) {
  var connection = connections[data.name]
  if (connection) {
    connection.setRemoteDescription(new RTCSessionDescription(data.answer))
  }
}

function onCandidate(data) {
  var connection = connections[data.name]
  if (connection) {
    connection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

function onPeerLeave(data) {
  var connection = connections[data.name]
  if (connection) {
    connection.close()
    connection.onaddstream = null
    connection.onicecandidate = null
  }
}

function closeAllPeerConnections() {
  for (var name in connections) {
    onPeerLeave(name)
  }
}

function hasUserMedia() {
  return !!navigator.mediaDevices.getUserMedia
}

function hasRTCPeerConnection() {
  return !!window.RTCPeerConnection
}

function getStream() {
  if (hasUserMedia()) {
    navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    }).then(s => {
      stream = s
      if (hasRTCPeerConnection()) {
        createPeerConnection(stream)
      } else {
        send({
          type: 'error',
          message: 'Sorry, your browser does not support WebRTC.'
        })
        alert('Sorry, your browser does not support WebRTC.')
      }
    }).catch(error => {
      send({
        type: 'error',
        message: 'Sorry, your browser does not support WebRTC.'
      })
      console.log(error);
    })
  } else {
    send({
      type: 'error',
      message: 'Sorry, your browser does not support WebRTC.'
    });
    alert('Sorry, your browser does not support WebRTC.')
  }
}

function createPeerConnection(data) {
  var configuration = {
    'iceServers': [{ 'url': 'stun:stun.1.google.com:19302' }]
  }
  var connection = new RTCPeerConnection(configuration)
  connection.addStream(stream)

  // Setup ice handling
  connection.onicecandidate = function (event) {
    console.log("On ICE Candidate")
    if (event.candidate) {
      send({
        name: data.name,
        type: "candidate",
        candidate: event.candidate
      })
    }
  }

  connections[data.name] = connection
}

function startPeerConnection(data) {
  var connection = connections[data.name]

  connection.createOffer(function (offer) {
    console.log("Createing Offer to ", data.name)
    send({
      name: data.name,
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

function stopStream() {
  stream.getAudioTracks().forEach(track => track.stop())
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.roomName) {
    return
  }

  var hangUpButton = document.querySelector('#hangup'),
    roomNameInput = document.querySelector('#room-name'),
    broadcastButton = document.querySelector('#broadcast')

  roomNameInput.addEventListener('keyup', () => {
    console.log('roomNameInput keyup event');
    broadcastButton.disabled = roomNameInput.value.length == 0
  }, true)

  broadcastButton.addEventListener('click', () => {
    roomName = roomNameInput.value
    chan = socket.channel('webrtc:client-' + roomName, {})

    chan.join()
      .receive('ok', resp => { onConnected(true) })
      .receive('error', resp => { onConnected(false) })

    chan.on('webrtc:stream-request', data => {
      console.log('Got stream request', data)
      createPeerConnection(data)
      startPeerConnection(data)
    })

    chan.on('webrtc:answer', data => {
      console.log('Got answer', data);
      onAnswer(data)
    })

    chan.on('webrtc:candidate', data => {
      console.log('Got candidate', data);
      onCandidate(data)
    })

    chan.on('webrtc:leave', data => {
      console.log('Got leave', data)
      onPeerLeave(data.name)
    })
  })

  hangUpButton.addEventListener('click', () => {
    send({
      name: roomName,
      type: "leave"
    })

    stopStream()
    closeAllPeerConnections()

    hangUpButton.disabled = true
    broadcastButton.disabled = false
  })
})
