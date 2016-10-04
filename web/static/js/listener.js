import socket from "./socket"

socket.connect()

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

var chan,
    connection,
    channelName = uid(),
    roomName = window.roomName

function send(message) {
  chan.push("client:webrtc-" + channelName, message)
}

function setupPeerConnection() {
  console.log("Setting up RTCPeerConnection")
  var configuration = {
    "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
  }
  connection = new RTCPeerConnection(configuration)
  connection.onaddstream = (e) => {
    console.log('On Add Stream Fired')
    var theirAudio = document.querySelector('#theirs')
    theirAudio.src = window.URL.createObjectURL(e.stream)
  }
  connection.onicecandidate = (e) => {
    console.log('On Ice Candidate')
    if (e.candidate) {
      send({
        name: roomName,
        type: 'candidate',
        candidate: e.candidate
      })
    }
  }
}

function requestStream() {
  send({
    name: roomName,
    type: 'stream-request'
  })
}

function onConnected(success) {
  var joinButton = document.querySelector('#join'),
      hangUpButton = document.querySelector('#hangup')

  if (success) {
    joinButton.disabled = true
    hangUpButton.disabled = false

    setupPeerConnection()
    requestStream()
  }
}

function onOffer(data) {
  connection.setRemoteDescription(new RTCSessionDescription(data.offer))

  connection.createAnswer(answer => {
    connection.setLocalDescription(answer)
    send({
      name: roomName,
      type: 'answer',
      answer: answer
    })
  }, error => {
    send({
      type: 'error',
      message: 'onOffer error: ' + error
    })
    console.log('onOffer error:', error);
  })
}

function onCandidate(data) {
  connection.addIceCandidate(new RTCIceCandidate(data.candidate))
}

function onLeave(data) {
  if (connection) {
    connection.close()
    connection.onaddstream = null
    connection.onicecandidate = null
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.roomName) {
    return
  }

  var hostAudio = document.querySelector('#theirs'),
      joinButton = document.querySelector('#join'),
      hangUpButton = document.querySelector('#hangup')

  joinButton.addEventListener('click', event => {
    chan = socket.channel('webrtc:client-' + channelName, {})

    chan.join()
      .receive('ok', resp => { onConnected(true) })
      .receive('error', resp => { onConnected(false) })

    chan.on('webrtc:offer', data => {
      console.log('Got offer', data)
      onOffer(data)
    })

    chan.on('webrtc:candidate', data => {
      console.log('Got candidate', data)
      onCandidate(data)
    })

    chan.on('webrtc:leave', data => {
      console.log('Got leave', data)
      onLeave()
    })
  })

  hangUpButton.addEventListener('click', event => {
    send({
      name: name,
      type: 'leave'
    })

    onLeave()

    joinButton.disabled = false
    hangUpButton.disabled = true
  })
})
