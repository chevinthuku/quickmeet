const socket = io();
const videoGrid = document.getElementById('video-grid');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

let localStream;
let peers = {};
let micEnabled = true;
let camEnabled = true;
let screenSharing = false;

const roomId = window.location.pathname.split('/r/')[1];
socket.emit('join-room', { roomId });

// Initialize local media
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addTile(socket.id, localStream, true);
    monitorSpeaking(localStream, socket.id);
  } catch (err) {
    alert('Cannot access camera or mic. Check permissions.');
    console.error(err);
  }
}
initMedia();

// Socket handlers
socket.on('peers', (ids) => ids.forEach(createOffer));
socket.on('user-joined', createOffer);
socket.on('offer', ({ from, offer }) => handleOffer(from, offer));
socket.on('answer', ({ from, answer }) => peers[from].setRemoteDescription(answer));
socket.on('ice-candidate', ({ from, candidate }) => peers[from].addIceCandidate(new RTCIceCandidate(candidate)));
socket.on('user-left', removeTile);

// Chat
document.getElementById('chat-toggle').onclick = () => {
  chatPanel.style.display = chatPanel.style.display === 'flex' ? 'none' : 'flex';
};
chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    socket.emit('chat-message', chatInput.value);
    addChat('You', chatInput.value);
    chatInput.value = '';
  }
});
socket.on('chat-message', ({ user, text }) => addChat(user.slice(0, 4), text));
function addChat(user, msg) {
  const div = document.createElement('div');
  div.textContent = `${user}: ${msg}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Controls
document.getElementById('toggle-mic').onclick = () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  document.getElementById('toggle-mic').style.backgroundColor = micEnabled ? '' : '#dc2626';
};
document.getElementById('toggle-cam').onclick = () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  document.getElementById('toggle-cam').style.backgroundColor = camEnabled ? '' : '#dc2626';
};
document.getElementById('end-call').onclick = () => {
  Object.values(peers).forEach(pc => pc.close());
  localStream.getTracks().forEach(track => track.stop());
  socket.disconnect();
  window.location.href = '/';
};

// Screen Share
document.getElementById('share-screen').onclick = async () => {
  if (!screenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      replaceTrack(screenTrack);
      screenSharing = true;
      screenTrack.onended = stopScreenShare;
    } catch (err) {
      console.error('Screen share failed:', err);
    }
  } else {
    stopScreenShare();
  }
};
function stopScreenShare() {
  const camTrack = localStream.getVideoTracks()[0];
  replaceTrack(camTrack);
  screenSharing = false;
}
function replaceTrack(newTrack) {
  for (const pc of Object.values(peers)) {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(newTrack);
  }
}

// Reactions
document.getElementById('send-reaction').onclick = () => {
  const picker = document.getElementById('reaction-picker');
  picker.classList.toggle('hidden');
};
document.querySelectorAll('.emoji-option').forEach(el => {
  el.onclick = () => {
    const emoji = el.textContent;
    socket.emit('reaction', emoji);
    showReaction(socket.id, emoji);
    document.getElementById('reaction-picker').classList.add('hidden');
  };
});
socket.on('reaction', ({ user, emoji }) => showReaction(user, emoji));
function showReaction(userId, emoji) {
  const tile = document.getElementById(`tile-${userId}`);
  if (!tile) return;
  const el = document.createElement('div');
  el.className = 'emoji';
  el.textContent = emoji;
  el.style.left = '50%';
  el.style.top = '50%';
  tile.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// WebRTC Logic
async function createOffer(peerId) {
  const pc = new RTCPeerConnection();
  peers[peerId] = pc;
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (e) => addTile(peerId, e.streams[0], false);
  pc.onicecandidate = (e) => e.candidate && socket.emit('ice-candidate', { to: peerId, candidate: e.candidate });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: peerId, offer });
}
async function handleOffer(peerId, offer) {
  const pc = new RTCPeerConnection();
  peers[peerId] = pc;
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (e) => addTile(peerId, e.streams[0], false);
  pc.onicecandidate = (e) => e.candidate && socket.emit('ice-candidate', { to: peerId, candidate: e.candidate });

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: peerId, answer });
}

// Video Tiles
function addTile(id, stream, isLocal) {
  if (document.getElementById(`tile-${id}`)) return;

  const tile = document.createElement('div');
  tile.id = `tile-${id}`;
  tile.className = 'tile';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  video.srcObject = stream;
  if (isLocal) video.muted = true;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  if (!isLocal) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 1;
    slider.step = 0.05;
    slider.value = 1;
    slider.className = 'volume-slider';
    slider.oninput = () => (video.volume = slider.value);
    overlay.appendChild(slider);
  }

  tile.appendChild(video);
  tile.appendChild(overlay);
  videoGrid.appendChild(tile);
  updateGridLayout();
  monitorSpeaking(stream, id);
}
function removeTile(id) {
  const tile = document.getElementById(`tile-${id}`);
  if (tile) tile.remove();
  updateGridLayout();
}
function updateGridLayout() {
  const count = videoGrid.querySelectorAll('.tile').length;
  videoGrid.className = 'grid p-2 bg-black';
  if (count <= 1) videoGrid.classList.add('grid-1');
  else if (count === 2) videoGrid.classList.add('grid-2');
  else if (count <= 4) videoGrid.classList.add('grid-4');
  else videoGrid.classList.add('grid-6');
}

// Speaking Indicator
function monitorSpeaking(stream, userId) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tile = document.getElementById(`tile-${userId}`);
  function check() {
    analyser.getByteFrequencyData(data);
    const volume = data.reduce((a, b) => a + b) / data.length;
    if (tile) {
      if (volume > 30) tile.classList.add('speaking');
      else tile.classList.remove('speaking');
    }
    requestAnimationFrame(check);
  }
  check();
}
