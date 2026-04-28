const statusEl = document.querySelector('#status');
const talk = document.querySelector('#talk');
const orbText = document.querySelector('#orbText');
const logEl = document.querySelector('#log');
const muteBtn = document.querySelector('#mute');
const stopBtn = document.querySelector('#stop');
const textForm = document.querySelector('#textForm');
const textInput = document.querySelector('#textInput');

const params = new URLSearchParams(location.search);
let token = params.get('token') || localStorage.getItem('senecaVoiceToken') || '';
if (params.get('token')) {
  localStorage.setItem('senecaVoiceToken', token);
  history.replaceState(null, '', location.pathname);
}

let voiceEnabled = localStorage.getItem('senecaVoiceMuted') !== '1';
let busy = false;
let recognition = null;

function setStatus(text) { statusEl.textContent = text; }
function addLog(role, text) {
  const li = document.createElement('li');
  li.className = role;
  li.textContent = text;
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}
function setBusy(next) {
  busy = next;
  talk.classList.toggle('busy', busy);
  talk.disabled = busy;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => /Daniel|Arthur|George|Ryan|Oliver/i.test(v.name) && /en-GB/i.test(v.lang))
    || voices.find(v => /en-GB/i.test(v.lang))
    || voices.find(v => /en/i.test(v.lang));
  return preferred || null;
}

function speak(text) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1.02;
  utterance.pitch = 0.9;
  speechSynthesis.speak(utterance);
}

async function send(message) {
  if (!token) {
    const entered = prompt('Private token');
    if (!entered) return;
    token = entered.trim();
    localStorage.setItem('senecaVoiceToken', token);
  }
  const clean = message.trim();
  if (!clean || busy) return;
  addLog('user', clean);
  setBusy(true);
  setStatus('Thinking…');
  try {
    const res = await fetch('./api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: clean })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
    addLog('assistant', data.reply);
    setStatus('Ready');
    speak(data.reply);
  } catch (err) {
    console.error(err);
    addLog('error', `Error: ${err.message}`);
    setStatus('Something broke');
  } finally {
    setBusy(false);
  }
}

function makeRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onstart = () => { talk.classList.add('listening'); orbText.innerHTML = 'Listening…'; setStatus('Listening…'); };
  rec.onresult = (event) => {
    let interim = '';
    finalText = '';
    for (const result of event.results) {
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (interim || finalText) setStatus(finalText || interim);
  };
  rec.onerror = (event) => { addLog('error', `Mic error: ${event.error}`); setStatus('Mic error'); };
  rec.onend = () => {
    talk.classList.remove('listening'); orbText.innerHTML = 'Hold<br/>to talk';
    if (finalText.trim()) send(finalText);
    else if (!busy) setStatus('Ready');
  };
  return rec;
}

function startListening() {
  if (busy) return;
  speechSynthesis?.cancel();
  recognition = makeRecognition();
  if (!recognition) {
    setStatus('Speech recognition is not supported here. Type instead, or use Chrome/Safari.');
    return;
  }
  recognition.start();
}
function stopListening() {
  if (recognition) recognition.stop();
}

talk.addEventListener('pointerdown', startListening);
talk.addEventListener('pointerup', stopListening);
talk.addEventListener('pointercancel', stopListening);
talk.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') startListening(); });
talk.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') stopListening(); });

muteBtn.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('senecaVoiceMuted', voiceEnabled ? '0' : '1');
  muteBtn.textContent = voiceEnabled ? 'Voice on' : 'Voice off';
  if (!voiceEnabled) speechSynthesis.cancel();
});
stopBtn.addEventListener('click', () => speechSynthesis.cancel());
textForm.addEventListener('submit', e => { e.preventDefault(); const text = textInput.value; textInput.value = ''; send(text); });

muteBtn.textContent = voiceEnabled ? 'Voice on' : 'Voice off';
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
  setStatus('Voice input needs Chrome or Safari. Text input works here.');
}
