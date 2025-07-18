let previewStream;
let micEnabled = true;
let camEnabled = true;

document.getElementById('create-room').onclick = async () => {
  const roomId = Math.random().toString(36).substring(2, 8);
  await showPreview(roomId);
};

document.getElementById('join-room').onclick = async () => {
  const id = prompt('Enter Room ID:');
  if (id) await showPreview(id);
};

async function showPreview(roomId) {
  const modal = document.getElementById('preview');
  modal.classList.remove('hidden');

  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('preview-video').srcObject = previewStream;
  } catch (err) {
    alert('Camera/Mic access denied or not available.');
    console.error(err);
  }

  document.getElementById('toggle-mic').onclick = () => {
    micEnabled = !micEnabled;
    previewStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  };
  document.getElementById('toggle-cam').onclick = () => {
    camEnabled = !camEnabled;
    previewStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
  };

  document.getElementById('start-now').onclick = () => {
    modal.classList.add('hidden');
    window.location.href = `/r/${roomId}`;
  };
}
