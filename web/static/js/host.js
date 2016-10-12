import {uid, uid_simple} from "./utils"
import socket from "./socket"

socket.connect()

var chan,
    stream,
    channelName,
    connections = {}

function send(message) {
  chan.push('client:webrtc-' + channelName, message)
}

function requestStream() {
  send({
    type: 'stream-request'
  })
}

function onConnected(success) {
  if (success) {
    var joinButton = document.querySelector('#join'),
        hangUpButton = document.querySelector('#hangup')

    join.disabled = true
    hangUpButton.disabled = false

    if (window.isListener) {
      requestStream()
    } else {
      getStream()
    }
  }
}

function onStreamReady(data) {
  if ("members" in data) {
    for(var key in data.members) {
      var member = data.members[key]
      createPeerConnection(member)
      startPeerConnection(member)
    }
  } else if ("name" in data) {
    createPeerConnection(data)
    startPeerConnection(data)
  }
}

function announceStreamReady() {
  send({
    type: 'stream-ready'
  })
}

function onAnswer(data) {
  var connection = connections[data.name]
  if (connection) {
    connection.setRemoteDescription(new RTCSessionDescription(data.answer))
  }
}

function onOffer(data) {
  var connection
  if (!connections[data.name]) { createPeerConnection(data) }
  connection = connections[data.name]

  console.log('setting Remote description');
  connection.setRemoteDescription(new RTCSessionDescription(data.offer))

  connection.createAnswer(answer => {
    console.log('Creating Answer to ', data.name);
    connection.setLocalDescription(answer)
    send({
      name: data.name,
      type: 'answer',
      answer: answer
    })
  }, error => {
    send({
      type: 'error',
      message: 'onOffer error: ' + error
    })
    console.log('onOffer error:', error)
  })
}

function onCandidate(data) {
  var connection = connections[data.name]
  if (connection) {
    connection.addIceCandidate(new RTCIceCandidate(data.candidate))
  }
}

function onPeerLeave(name) {
  var audioElement = document.getElementById(uid_simple(name))
  if (audioElement) {
    audioElement.parentElement.removeChild(audioElement)
  }

  var connection = connections[name]
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
      video: true,
      audio: true
    }).then(s => {
      stream = s
      announceStreamReady()
    })
  } else {
    alert('Sorry, your browser does not support WebRTC.')
  }
}

function createPeerConnection(data) {
  var configuration = {
    'iceServers': [{ 'url': 'stun:stun.1.google.com:19302' }]
  }
  var connection = new RTCPeerConnection(configuration)
  if (!window.isListener) {
    connection.addStream(stream)
  }
  connection.onaddstream = (e) => {
    console.log('On Add Stream Fired')
    var otherStreams = document.querySelector('#other-streams')
    var audioElement = document.createElement('audio')
    audioElement.autoplay = true
    audioElement.src = window.URL.createObjectURL(e.stream)
    audioElement.id = uid_simple(data.name)
    otherStreams.appendChild(audioElement)
  }
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
  var joinButton = document.querySelector('#join'),
      hangUpButton = document.querySelector('#hangup')

  joinButton.addEventListener('click', () => {
    channelName = uid()
    chan = socket.channel('webrtc:client-' + channelName, {isListener: window.isListener})

    chan.join()
      .receive('ok', resp => { onConnected(true) })
      .receive('error', resp => { onConnected(false) })

    chan.on('webrtc:stream-ready', data => {
      console.log('Got stream ready', data);
      onStreamReady(data)
    })

    chan.on('webrtc:stream-request', data => {
      console.log('Got stream request', data)
      createPeerConnection(data)
      startPeerConnection(data)
    })

    chan.on('webrtc:offer', data => {
      console.log('Got offer', data)
      onOffer(data)
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
      type: "leave"
    })

    if (!window.isListener) {
      stopStream()
    }
    closeAllPeerConnections()

    joinButton.disabled = false
    hangUpButton.disabled = true
  })
})
