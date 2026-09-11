// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 🎤 음성 입력(2026-09-10): 마이크 녹음(MediaRecorder, webm/opus) → 데몬 POST /api/transcribe(로컬 위스퍼) → 글을 입력창 커서 자리에 삽입.
   자동 전송 없음 — 사용자가 읽고 Enter. 클릭/Ctrl+M = 시작·정지, Esc = 취소(버림). 최대 10분이면 자동 정지.
   실패하면 녹음은 데몬 state\voice\ 에 남고 띠의 "다시 시도"가 같은 파일로 재요청한다. */
window.Voice = (() => {
  const $ = (s) => document.querySelector(s);
  const MAX_MS = 10 * 60 * 1000;
  let o = null;                               // { textarea, button, strip, folderHint(), onBusy(bool) }
  let state = 'idle';                         // idle | recording | transcribing
  let stream = null, rec = null, chunks = [], ctx = null, analyser = null, raf = 0, t0 = 0, timer = 0, maxTimer = 0, discard = false;
  let retryFile = null, msgTimer = 0;
  const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const el = (k) => o.strip.querySelector(k);

  function init(opts) {
    o = opts;
    o.button.classList.remove('soon'); o.button.title = '음성 입력 — 클릭·Ctrl+M: 녹음 시작/정지 · Esc: 취소 (로컬 위스퍼, 글은 입력창에 들어오고 Enter로 보냄)';
    o.button.onclick = toggle;
    el('.vs-retry').onclick = () => { if (retryFile) transcribe(null, retryFile); };
    el('.vs-close').onclick = () => { if (state === 'recording') cancel(); else hide(); };
    checkAvailable();
  }
  // 선택 기능(2026-09-11 매듭 풀기): 데몬이 파이썬·faster-whisper 를 못 찾으면(available === false) 🎤는 흐리게 두고 누르면 설치 안내만 띄운다.
  // 옛 데몬(available 없음)이나 아직 확인 중(null)이면 쓸 수 있는 것으로 본다. 시작 직후엔 확인이 안 끝났을 수 있어 잠시 뒤 한 번 더 본다.
  let unavailable = null;                     // null = 쓸 수 있음(또는 미확인), 문자열 = 못 쓰는 사유
  async function checkAvailable(retry = true) {
    try {
      const s = await (await fetch('/api/voice/status')).json();
      if (s.available === false) { unavailable = s.reason || '이 PC에는 음성 엔진(파이썬 + faster-whisper)이 없습니다.'; o.button.classList.add('soon'); o.button.title = '음성 입력 사용 불가 — 누르면 설치 안내'; }
      else { unavailable = null; o.button.classList.remove('soon'); if (s.available == null && retry) setTimeout(() => checkAvailable(false), 25000); }
    } catch {}
  }
  function show(cls) { o.strip.hidden = false; o.strip.className = 'voice-strip ' + (cls || ''); }
  function hide() { o.strip.hidden = true; clearTimeout(msgTimer); el('.vs-retry').hidden = true; retryFile = null; }
  function msg(text, err) { const m = el('.vs-msg'); m.textContent = text; m.classList.toggle('err', !!err); }
  function busy(b) { state = b ? state : 'idle'; o.button.classList.toggle('rec', state === 'recording'); o.button.classList.toggle('wait', state === 'transcribing'); o.onBusy?.(state !== 'idle'); }

  async function toggle() {
    if (state === 'recording') return stop();
    if (state === 'transcribing') return;                  // 전사 중엔 무시(끝나면 자동 해제)
    if (unavailable) return Dialog.alert('🎤 음성 입력을 쓸 수 없습니다.\n\n' + unavailable + '\n\n설치한 뒤 ⏻ 전부 종료 → IRIS-Face 를 다시 실행하면 켜집니다. (글자 입력은 그대로 쓸 수 있습니다.)');
    await start();
  }
  async function start() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return Dialog.alert('마이크를 열 수 없습니다: ' + e.message + '\n(윈도우 설정 → 개인 정보 → 마이크 허용을 확인해 주세요)'); }
    state = 'recording'; discard = false; chunks = []; busy(true);
    ctx = new AudioContext(); analyser = ctx.createAnalyser(); analyser.fftSize = 512; ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    (function tick() { analyser.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); el('.vs-meter i').style.width = Math.min(100, m / 128 * 300) + '%'; raf = requestAnimationFrame(tick); })();
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(raf); clearInterval(timer); clearTimeout(maxTimer);
      stream?.getTracks().forEach(t => t.stop()); stream = null; ctx?.close(); ctx = null; el('.vs-meter i').style.width = 0;
      const secs = (Date.now() - t0) / 1000;
      if (discard) { busy(false); hide(); o.textarea.focus(); return; }
      transcribe(new Blob(chunks, { type: mime }), null, secs);
    };
    try { rec.start(250); }
    catch (e) {   // 녹음기 시작 실패(코덱·장치) — 스트림을 놓고 원래 상태로
      cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); stream = null; ctx.close(); ctx = null; rec = null; busy(false); hide();
      return Dialog.alert('녹음을 시작할 수 없습니다: ' + e.message);
    }
    t0 = Date.now();
    show('recording'); el('.vs-time').textContent = '00:00'; el('.vs-retry').hidden = true; msg('듣는 중 — 다시 누르면 정지, Esc는 취소');
    timer = setInterval(() => { el('.vs-time').textContent = fmt(Date.now() - t0); }, 250);
    maxTimer = setTimeout(() => { if (state === 'recording') { msg('10분이 되어 자동으로 정지합니다'); stop(); } }, MAX_MS);
    // 엔진 준비 상태를 물어 안내(녹음은 그대로 진행 — 정지하면 준비되는 대로 전사)
    fetch('/api/voice/status').then(r => r.json()).then((s) => { if (state !== 'recording') return; if (s.error) msg('음성 엔진 오류: ' + s.error, true); else if (!s.ready) msg(s.loading ? '듣는 중 — 음성 엔진(모델) 올리는 중, 정지하면 준비되는 대로 전사합니다' : '듣는 중 — 음성 엔진 준비 중(첫 실행 약 50초)'); }).catch(() => {});
  }
  function stop() { if (state !== 'recording' || !rec) return; try { rec.stop(); } catch {} }
  function cancel() { if (state !== 'recording') return false; discard = true; stop(); return true; }

  async function transcribe(blob, file, secs) {
    state = 'transcribing'; busy(true); show('transcribing'); el('.vs-retry').hidden = true;
    msg(`전사 중…${secs ? ` (녹음 ${fmt(secs * 1000)})` : ''}`);
    const headers = { 'x-audio-ext': 'webm' };
    const hint = o.folderHint?.(); if (hint) headers['x-folder-hint'] = encodeURIComponent(hint);
    if (file) headers['x-retry-file'] = encodeURIComponent(file);
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers, body: file ? null : blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { file: j.file });
      busy(false);
      const text = (j.text || '').trim();
      if (!text) { msg('들린 말이 없습니다'); msgTimer = setTimeout(hide, 2500); o.textarea.focus(); return; }
      insert(text); hide(); o.textarea.focus();
    } catch (e) {
      busy(false); show('error'); msg('전사 실패: ' + e.message, true);
      retryFile = e.file || file || null; el('.vs-retry').hidden = !retryFile;
    }
  }
  // 커서 자리에 넣는다. 앞이 비어 있지 않으면 공백(줄 끝이면 줄바꿈 유지)으로 잇는다. input 이벤트를 쏴 자동 높이·이력 리셋이 돌게 한다.
  function insert(text) {
    const ta = o.textarea; const p = ta.selectionStart ?? ta.value.length, q = ta.selectionEnd ?? p;
    const before = ta.value.slice(0, p), after = ta.value.slice(q);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    const sep2 = after && !/^\s/.test(after) ? ' ' : '';
    ta.value = before + sep + text + sep2 + after;
    ta.selectionStart = ta.selectionEnd = (before + sep + text).length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { init, toggle, stop, cancel, insert, isRecording: () => state === 'recording', isBusy: () => state !== 'idle' };
})();
