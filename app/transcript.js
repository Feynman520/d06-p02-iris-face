// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 대화 화면 렌더러 — 차례(turn) 단위.
   내 요청 → [과정: 생각·도구·중간 답] → 최종 답.  진행 중엔 과정의 최신 한 단계만 부드럽게 넘어가며 보이고,
   답이 나오면(세션이 대기로 돌아오면) 과정은 "과정 N단계"로 접힌다.
   본문·도구 결과에 든 이미지·HTML·로컬 주소는 대화 안에 순서대로 삽입한다(/api/file 경유). 내장 마크다운(외부 라이브러리 없음). */
// 인스턴스 여러 개(2026-09-11): window.Transcript = 메인 대화, Transcript.create() = 보조 작업 서랍 등 두 번째 화면.
function createTranscript() {
  const RENDER_WINDOW = 300;
  let root = null, items = [], shown = 0, unknownCount = 0, followBottom = true, busy = false, activity = '';
  let turn = null; // 진행 중인 차례 { el, steps, stepsList, live, answer, count, chips }
  // 보조 작업 칩(2026-09-11): subsList = 데몬이 준 이 세션의 보조 목록 · callTurn = 부모 Agent 호출 id → 그 차례의 칩 상자 · lastChips = 가장 최근 칩 상자(연결 못 한 보조가 놓일 곳)
  let subsList = [], subPick = null, subActive = null, callTurn = new Map(), lastChips = null;
  let primed = null; // 세션 기록파일이 생기기 전에 먼저 보여 주는 요청문(있으면 "세션 여는 중" 상태)
  let opening = false; // 새 세션의 첫 답변(생각·도구·답 중 첫 항목)이 오기 전까지 true — 이 동안의 진행 문구는 "세션 여는 중"
  const LOADING = '세션 여는 중 — 도구와 컨텍스트를 불러옵니다 (첫 답변은 최대 1분)';
  // 이어가기 요청(열린 세션에 보내기)도 터미널처럼 보낸 즉시 그린다(2026-09-10). 기록파일에 요청문이 적히기까지(CLI 1~2초 + 폴링)
  // 기다리지 않는다: pend()가 요청문 말풍선 + "요청 전달 중" 진행 표시를 먼저 놓고, 기록의 요청문(kind:user)이 도착하면 치운다(중복 방지).
  let pending = null;   // { bubble, turn, timer } — 미리 그린 요청문과 그 차례
  let awaiting = false; // 요청을 보낸 뒤 첫 응답 항목(생각·도구·답)이 오기 전까지 true — 이 동안은 대기 상태 신호가 와도 진행 표시를 내리지 않는다
  const SENDING = '요청 전달 중';
  const SENT_WAIT = '기록에 아직 안 보입니다 — 터미널(Ctrl+T)에서 세션 상태를 확인해 주세요';

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fileUrl = (p) => `/api/file?path=${encodeURIComponent(p)}`;
  // 괄호 붙여넣기 표식 `<pasted_content id="…">…</pasted_content id="…">` (클로드코드 2.1.27x) 는 데몬이 지운다(daemon/facenote.mjs stripPasteMarks).
  // 화면에도 같은 처리를 한 겹 더 둔다(v2.72.1, 2026-09-20 실측): 데몬은 켜진 채 파일만 새 판이면 옛 데몬이 표식을 그대로 내보내는데,
  // 화면 파일은 요청마다 디스크에서 읽히므로 F5 만으로 깨끗해진다. 정규식은 facenote.mjs 와 같아야 한다(시험 = scripts/check-facenote.mjs).
  // paste-strip-begin
  function stripPasteMarks(s) { return String(s ?? '').replace(/<pasted_content\b[^>]*>\r?\n?/g, '').replace(/\r?\n?<\/pasted_content\b[^>]*>/g, ''); }
  // paste-strip-end

  // ---- 최소 마크다운 ----
  function md(src) {
    const lines = String(src ?? '').replace(/\r\n/g, '\n').split('\n');
    let html = '', i = 0;
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$)/g, '$1<i>$2</i>')
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<span class="md-img" data-src="$2">$1</span>')
      .replace(/\[([^\]]+)\]\(&lt;([^&]+)&gt;\)/g, '<a href="$2" data-local="1">$1</a>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue; }
      const h = l.match(/^(#{1,6})\s+(.*)$/); if (h) { html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`; i++; continue; }
      if (/^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        const tag = /^\s*\d+[.)]\s+/.test(l) ? 'ol' : 'ul'; let out = '';
        while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*\d+[.)]\s+/.test(lines[i]))) { out += `<li>${inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`; i++; }
        html += `<${tag}>${out}</${tag}>`; continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const cells = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
        let out = `<table><thead><tr>${cells(l).map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`; i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { out += `<tr>${cells(lines[i]).map(c => `<td>${c}</td>`).join('')}</tr>`; i++; }
        html += out + '</tbody></table>'; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { html += '<hr>'; i++; continue; }
      if (!l.trim()) { i++; continue; }
      const para = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      html += `<p>${para.map(inline).join('<br>')}</p>`;
    }
    return html;
  }

  // ---- 삽입물: 텍스트에서 이미지·HTML·로컬 주소를 찾아 대화 안에 순서대로 넣는다 ----
  // 윈도 경로: 드라이브 문자로 시작, 파일명에 못 쓰는 글자(:*?"<>|)만 빼고 공백·괄호·한글 모두 허용, 확장자에서 끝난다
  // (IRIS 폴더명에 공백과 괄호가 많아 예전 규칙으로는 한 번도 안 잡혔다 — 2026-09-09 수정)
  const IMG_RE = /(?:\/|file:\/\/\/)?[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n`]+[\\/])*[^\\/:*?"<>|\r\n`]*?\.(?:png|jpe?g|gif|webp|svg|bmp)(?!\w)/gi;
  const HTML_RE = /(?:\/|file:\/\/\/)?[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n`]+[\\/])*[^\\/:*?"<>|\r\n`]*?\.html?(?!\w)/gi;
  // 문서(한/글·워드·엑셀·PPT)와 PDF: PDF는 그대로, 나머지는 데몬이 PDF로 변환해 대화 안에 넣는다.
  const DOC_RE = /(?:\/|file:\/\/\/)?[A-Za-z]:[\\/](?:[^\\/:*?"<>|\r\n`]+[\\/])*[^\\/:*?"<>|\r\n`]*?\.(?:hwpx?|docx?|rtf|odt|xlsx?|xlsm|ods|pptx?|odp|pdf)(?!\w)/gi;
  const LOCAL_URL_RE = /https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?[^\s"'<>)]*/g;
  const normPath = (p) => p.replace(/^file:\/\/\//i, '').replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\').trim();
  const docUrl = (p) => `/api/doc?path=${encodeURIComponent(p)}`;
  // 앱 자기 주소(데몬 127.0.0.1:3458 등, 도구 출력에 자주 찍힘)는 넣지 않는다 — 대화 안에 Face 화면이 재귀로 열리고(2026-09-10 실측 5개) 초점까지 가져간다.
  const isSelfUrl = (u) => { try { const x = new URL(u); return x.port === location.port && (x.hostname === '127.0.0.1' || x.hostname === 'localhost'); } catch { return false; } };
  // data-born = 삽입 시각: 뷰어(PDF 등)가 로드되며 초점을 뺏으면 main.js가 이 값을 보고 입력창으로 되돌린다.
  const born = () => `data-born="${Date.now()}"`;
  function embedsFor(text) {
    const out = []; const seen = new Set();
    const add = (kind, key, html) => { if (!seen.has(key)) { seen.add(key); out.push({ kind, html }); } };
    for (const m of String(text || '').matchAll(IMG_RE)) { const p = normPath(m[0]); add('img', p.toLowerCase(), `<figure class="embed pic"><div class="pic-box"><img src="${fileUrl(p)}" alt="" loading="lazy" onload="if(this.naturalWidth<640)this.classList.add('small')" onerror="this.closest('figure').classList.add('broken')"></div><figcaption><code>${esc(p)}</code><button class="icon-btn small" data-open="${esc(p)}" title="새 창에서 열기">⧉</button></figcaption></figure>`); }
    for (const m of String(text || '').matchAll(HTML_RE)) { const p = normPath(m[0]); add('html', p.toLowerCase(), `<figure class="embed frame"><iframe src="${fileUrl(p)}" ${born()} loading="lazy" sandbox="allow-scripts allow-same-origin" title="${esc(p)}"></iframe><figcaption><code>${esc(p)}</code><button class="icon-btn small" data-open="${esc(p)}" title="새 창에서 열기">⧉</button></figcaption></figure>`); }
    for (const m of String(text || '').matchAll(DOC_RE)) {
      const p = normPath(m[0]); const isPdf = /\.pdf$/i.test(p);
      const src = isPdf ? fileUrl(p) : docUrl(p);
      const note = isPdf ? '' : '<span class="doc-note">PDF 미리보기로 변환</span>';
      // ⧉: PDF는 브라우저 새 창, 그 외 문서(한/글·오피스)는 브라우저가 못 여니 이 PC의 기본 앱으로 연다(/api/open)
      const open = isPdf ? `data-open="${esc(p)}" title="새 창에서 열기"` : `data-open-app="${esc(p)}" title="기본 앱으로 원본 열기"`;
      add('doc', p.toLowerCase(), `<figure class="embed frame doc"><iframe src="${esc(src)}" ${born()} loading="lazy" title="${esc(p)}"></iframe><figcaption>${note}<code>${esc(p)}</code><button class="icon-btn small" ${open}>⧉</button></figcaption></figure>`);
    }
    // 로컬 주소는 바로 iframe으로 넣지 않는다 — 서버가 꺼져 있으면 하얀 상자만 남는다(2026-09-10 실측: 대화에 적힌 설계상 주소 :3459).
    // 자리표시자만 넣고, 화면에 붙은 뒤 probeUrl()이 살아 있는지 확인해 iframe 또는 '응답 없음' 한 줄로 바꾼다.
    for (const m of String(text || '').matchAll(LOCAL_URL_RE)) { const u = m[0].replace(/[.,;:]+$/, ''); if (isSelfUrl(u)) continue; add('url', u, `<figure class="embed url-probe" data-probe="${esc(u)}"><figcaption><span class="url-state">확인 중…</span><code>${esc(u)}</code><button class="icon-btn small" data-open="${esc(u)}" title="새 창에서 열기">⧉</button></figcaption></figure>`); }
    return out.map(e => e.html).join('');
  }

  // ---- 로컬 주소 생존 확인: 살아 있으면 iframe, 죽어 있으면 한 줄('서버 응답 없음' + 다시 확인) ----
  // no-cors fetch는 서버가 응답만 하면 (내용은 못 봐도) 성공으로 풀리고, 연결 거부·시간 초과면 실패한다.
  async function urlAlive(u, ms = 2000) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
    try { await fetch(u, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal }); return true; }
    catch { return false; } finally { clearTimeout(t); }
  }
  async function probeUrl(fig) {
    const u = fig.dataset.probe; if (!u || fig.dataset.probing) return;
    fig.dataset.probing = '1'; const st = fig.querySelector('.url-state'); if (st) st.textContent = '확인 중…';
    const ok = await urlAlive(u);
    delete fig.dataset.probing; if (!fig.isConnected) return;
    if (ok) {
      fig.className = 'embed frame';
      fig.innerHTML = `<iframe src="${esc(u)}" ${born()} loading="lazy" title="${esc(u)}"></iframe><figcaption><code>${esc(u)}</code><button class="icon-btn small" data-open="${esc(u)}" title="새 창에서 열기">⧉</button></figcaption>`;
      delete fig.dataset.probe;
    } else {
      fig.className = 'embed url-off';
      fig.innerHTML = `<figcaption><span class="url-state off">서버 응답 없음</span><code>${esc(u)}</code><button class="icon-btn small" data-reprobe title="다시 확인">↻</button><button class="icon-btn small" data-open="${esc(u)}" title="새 창에서 열기">⧉</button></figcaption>`;
    }
  }
  const probeAll = (scope) => { if (scope.querySelectorAll) for (const f of scope.querySelectorAll('figure[data-probe]')) probeUrl(f); };

  const timeOf =(t) => t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
  const lineCap = (text, n = 20) => { const ls = String(text ?? '').split('\n'); return ls.length > n ? { head: ls.slice(0, n).join('\n'), rest: ls.slice(n).join('\n') } : { head: text, rest: '' }; };
  const stepLabel = (it) => it.kind === 'thinking' ? '생각 중' : it.kind === 'tool' ? `${it.name}${it.detail ? ' · ' + it.detail : ''}` : it.kind === 'tool_result' ? '결과 확인' : it.kind === 'subagent' ? `보조 작업 ${it.n}개${it.detail ? ' · ' + it.detail : ''}` : it.kind === 'assistant' ? it.text.split('\n')[0] : it.kind;

  // ---- 복사 버튼: 요청문·답변의 원문(마크다운 그대로)을 클립보드에 넣는다 ----
  const COPY_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const copyBtnHtml = () => `<button class="copy-btn" data-copy title="내용 복사">${COPY_SVG}</button>`;
  /** innerHTML로 만든 버튼에 원문을 붙인다(속성이 아니라 객체 속성으로 — 긴 본문도 DOM을 무겁게 하지 않는다). */
  const bindCopy = (el, text) => { const b = el.querySelector('[data-copy]'); if (b) b._copyText = text; return el; };
  async function copyText(btn) {
    const text = btn._copyText ?? ''; let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch { // 클립보드 API가 막힌 환경(권한·비보안 컨텍스트)에서는 옛 방식으로 한 번 더
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
    }
    btn.classList.toggle('done', ok); btn.classList.toggle('fail', !ok);
    btn.innerHTML = ok ? CHECK_SVG : COPY_SVG; btn.title = ok ? '복사됨' : '복사 실패';
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('done', 'fail'); btn.innerHTML = COPY_SVG; btn.title = '내용 복사'; }, 1500);
  }

  // ---- 노드 ----
  function bubble(it, cls) {
    const el = document.createElement('div'); el.className = `msg ${cls}`; el.dataset.i = it.i;
    const text = cls === 'user' ? stripPasteMarks(it.text).trim() : it.text; // 요청문은 붙여넣기 표식을 걷어낸 뒤 그린다
    const att = cls === 'user' ? text.match(/\n\n\[첨부 파일\]\n([\s\S]+)$/) : null;
    const body = att ? text.slice(0, att.index) : text;
    el.innerHTML = `<div class="bubble">${md(body)}${att ? `<div class="attach-block">${att[1].split('\n').filter(Boolean).map(p => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(p) ? `<img src="${fileUrl(p.trim())}" alt="" class="attach-thumb">` : `<code>${esc(p)}</code>`).join('')}</div>` : ''}</div>${embedsFor(body)}<span class="ts">${it.policy ? '<span class="pill">도구 세트 안내 포함</span> ' : ''}${timeOf(it.t)}${copyBtnHtml()}</span>`;
    return bindCopy(el, body); // 요청문은 내가 쓴 글만(첨부 목록 제외), 답변은 전문
  }
  function stepNode(it) {
    const el = document.createElement('div'); el.className = `step ${it.kind}`;
    switch (it.kind) {
      case 'thinking': el.innerHTML = `<details><summary>◌ 생각</summary><pre>${esc(it.text)}</pre></details>`; break;
      case 'tool': el.innerHTML = `<div class="step-line">⚙ <b>${esc(it.name)}</b> <span class="tool-detail">${esc(it.detail || '')}</span></div>`; break;
      case 'tool_result': { const { head, rest } = lineCap(it.text); el.innerHTML = `<pre class="result${it.error ? ' err' : ''}">${esc(head)}</pre>${rest ? `<details class="more"><summary>더 보기 (${rest.split('\n').length}줄)</summary><pre class="result">${esc(rest)}</pre></details>` : ''}${embedsFor(it.text)}`; break; }
      case 'subagent': el.innerHTML = `<div class="step-line">↳ 보조 작업 ${it.n}개${it.detail ? ' · ' + esc(it.detail) : ''}</div>`; break;
      case 'assistant': el.innerHTML = `<div class="step-text">${md(it.text)}</div>${embedsFor(it.text)}<span class="ts">${copyBtnHtml()}</span>`; bindCopy(el, it.text); break;
      case 'ask': el.innerHTML = `<div class="card-ask">⚠ 답이 필요합니다 — <b>터미널에서 답해 주세요</b> (Ctrl+T)<div class="q">${md(it.text)}</div></div>`; break;
      default: return null;
    }
    return el;
  }

  // ---- 차례(turn) 관리 ----
  function newTurn() {
    const el = document.createElement('div'); el.className = 'turn';
    el.innerHTML = `<div class="steps"><div class="steps-live"><span class="dots"><i></i><i></i><i></i></span><span class="live-text"></span><button class="stop-btn" title="진행 중인 작업 중단 (Esc)">■ 중단 · Esc</button></div><details class="steps-all"><summary></summary><div class="steps-list"></div></details></div>`;
    turn = { el, steps: el.querySelector('.steps'), stepsList: el.querySelector('.steps-list'), live: el.querySelector('.live-text'), all: el.querySelector('.steps-all'), answer: null, count: 0, chips: null };
    turn.steps.hidden = true;
    return el;
  }
  function pushStep(it) {
    if (!turn) root.appendChild(newTurn());
    const n = stepNode(it); if (!n) return;
    turn.stepsList.appendChild(n); turn.count++;
    turn.steps.hidden = false;
    turn.all.querySelector('summary').textContent = `과정 ${turn.count}단계`;
    showLive(stepLabel(it));
  }
  function showLive(text, t = turn) {
    if (!t) return;
    const live = t.live; if (live.textContent === text) return;
    live.classList.remove('in'); void live.offsetWidth; live.textContent = text; live.classList.add('in');
  }
  function setAnswer(it) {
    if (!turn) root.appendChild(newTurn());
    if (turn.answer) { // 앞선 답은 과정으로 내려간다
      const prev = turn.answer; prev.remove(); pushStep({ kind: 'assistant', text: prev.dataset.text, i: prev.dataset.i });
    }
    const el = bubble(it, 'assistant'); el.dataset.text = it.text;
    turn.el.appendChild(el); turn.answer = el;
  }
  function settleTurn() { // 답이 끝났을 때: 과정을 접는다(단계가 없으면 아예 감춘다)
    if (!turn) return;
    turn.steps.classList.add('settled'); turn.all.open = false;
    if (turn.count === 0) { turn.steps.hidden = true; if (!turn.answer && !turn.el.children.length) turn.el.remove(); }
  }
  function place(it) {
    if (it.kind === 'user') { settleTurn(); turn = null; root.appendChild(bubble(it, 'user')); return; }
    if (it.kind === 'compact') { settleTurn(); turn = null; const d = document.createElement('div'); d.className = 'msg compact'; d.innerHTML = '<div class="rule"><span>이전 대화 요약됨</span></div>'; root.appendChild(d); return; }
    if (it.kind === 'command') { const d = document.createElement('div'); d.className = 'msg command'; d.innerHTML = `<span class="pill">명령 ${esc(it.text)}</span>`; root.appendChild(d); return; }
    if (it.kind === 'unknown') return;
    if (it.kind === 'assistant') { setAnswer(it); return; }
    if (turn?.answer) { // 답 뒤에 또 과정이 오면 그 답은 중간 답이었다
      const prev = turn.answer; prev.remove(); turn.answer = null; pushStep({ kind: 'assistant', text: prev.dataset.text, i: prev.dataset.i });
      turn.steps.classList.remove('settled');
    }
    // 보조 작업 호출: 이 차례에 칩 상자를 두고, 부모 호출 id로 그 상자를 찾을 수 있게 한다(칩 자체는 데몬의 목록이 오면 applySubs가 그린다)
    if (it.kind === 'subagent') { if (!turn) root.appendChild(newTurn()); ensureChips(turn); if (it.callId) callTurn.set(it.callId, turn.chips); }
    pushStep(it);
  }

  // ---- 보조 작업 칩(2026-09-11) ----
  function ensureChips(t) {
    if (!t.chips) { const box = document.createElement('div'); box.className = 'sub-chips'; t.steps.insertBefore(box, t.all); t.chips = box; }
    lastChips = t.chips; return t.chips;
  }
  /** 데몬의 보조 목록으로 칩을 만들거나 제자리에서 갱신한다(멱등). 연결된 차례가 없는 보조는 가장 최근 칩 상자에 놓는다. */
  function applySubs() {
    if (!root || !subsList.length) return;
    for (const s of subsList) {
      let box = (s.toolUseId && callTurn.get(s.toolUseId)) || lastChips;
      if (!box && turn) box = ensureChips(turn);
      if (!box) continue;
      let chip = root.querySelector(`.sub-chip[data-key="${CSS.escape(s.key)}"]`);
      if (!chip) { chip = document.createElement('button'); chip.className = 'sub-chip'; chip.dataset.key = s.key; chip.innerHTML = '<i class="sc-dot"></i><span class="sc-name"></span><span class="sc-meta"></span>'; chip.onclick = () => subPick?.(s.key); box.appendChild(chip); }
      else if (chip.parentElement !== box) box.appendChild(chip);
      const d = subMeta(s);
      chip.className = `sub-chip ${s.status}${subActive === s.key ? ' active' : ''}`;
      chip.title = `${s.detail || ''}${s.detail ? '\n' : ''}${s.file || ''}`;
      const name = chip.querySelector('.sc-name'); if (name.textContent !== s.name) name.textContent = s.name;
      const meta = chip.querySelector('.sc-meta'); const mt = [s.model, d.status, `도구 ${s.tools}회`, d.elapsed].filter(Boolean).join(' · '); if (meta.textContent !== mt) meta.textContent = mt;
    }
  }
  function setSubagents(list, onPick) { subsList = Array.isArray(list) ? list : []; subPick = onPick || null; applySubs(); }
  function markSub(key) { subActive = key; applySubs(); }
  const tick = () => applySubs();

  // ---- 공개 API ----
  function mount(el) {
    root = el;
    root.addEventListener('scroll', () => { followBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 40; if (root.scrollTop < 60) showMore(); });
    // 새로 붙은 로컬 주소 자리표시자를 발견하는 즉시 생존 확인(innerHTML로 어디서 만들어지든 한 곳에서 처리).
    new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.matches?.('figure[data-probe]')) probeUrl(n); else probeAll(n); } })
      .observe(root, { childList: true, subtree: true });
    probeAll(root);
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]'); if (c) { copyText(c); return; }
      const rp = e.target.closest('[data-reprobe]'); if (rp) { const f = rp.closest('figure'); if (f) { f.dataset.probe = f.querySelector('code')?.textContent || ''; probeUrl(f); } return; }
      const b = e.target.closest('[data-open]'); if (b) { const v = b.dataset.open; window.open(/^https?:/.test(v) ? v : fileUrl(v), '_blank'); }
      const o = e.target.closest('[data-open-app]'); if (o) openWithApp(o);
      const a = e.target.closest('a[data-local]'); if (a) { e.preventDefault(); window.open(fileUrl(normPath(a.getAttribute('href'))), '_blank'); }
    });
  }
  // 브라우저가 못 여는 문서(한/글·오피스)는 데몬에 부탁해 이 PC의 기본 앱으로 연다. 실패하면 사유를 버튼 옆에 잠깐 보여준다.
  async function openWithApp(btn) {
    btn.disabled = true;
    try {
      const r = await fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: btn.dataset.openApp }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
    } catch (err) {
      let n = btn.parentElement.querySelector('.open-err'); if (!n) { n = document.createElement('span'); n.className = 'doc-note open-err'; btn.parentElement.appendChild(n); }
      n.textContent = `열기 실패: ${err.message}`; setTimeout(() => n.remove(), 6000);
    } finally { btn.disabled = false; }
  }
  function clear() { items = []; shown = 0; unknownCount = 0; turn = null; primed = null; opening = false; clearTimeout(pending?.timer); pending = null; awaiting = false; callTurn = new Map(); lastChips = null; if (root) root.innerHTML = ''; }
  /** 새 세션 직후: 기록파일이 아직 없어도 내 요청문과 "세션 여는 중" 표시를 바로 그린다. 실제 기록이 오면 자연히 대체된다. */
  function prime(text) {
    clear(); primed = text; opening = true;
    root.appendChild(bubble({ i: 0, t: new Date().toISOString(), text }, 'user'));
    root.appendChild(newTurn()); turn.steps.hidden = false; showLive(LOADING);
  }
  /** 열린 세션에 요청을 보낸 직후: 기록파일보다 먼저 내 요청문 말풍선과 "요청 전달 중" 진행 표시를 그린다(터미널의 즉시 반영과 같게).
      기록의 요청문이 도착하면 append()가 미리 그린 것을 치운다. 45초가 지나도 기록에 안 보이면 진행 문구로 알린다(요청이 CLI에 안 들어간 경우 — 승인 대기 등). */
  function pend(text) {
    if (!root) return;
    dropPending();
    settleTurn(); turn = null; // 앞 차례는 접는다
    const b = bubble({ i: 0, t: new Date().toISOString(), text }, 'user'); b.classList.add('pending'); root.appendChild(b);
    root.appendChild(newTurn()); turn.steps.hidden = false; showLive(SENDING);
    const t = turn;
    pending = { bubble: b, turn: t, timer: setTimeout(() => { if (pending?.turn === t && t.count === 0) showLive(SENT_WAIT, t); }, 45000) };
    awaiting = true;
    root.scrollTop = root.scrollHeight; followBottom = true;
  }
  /** 미리 그린 요청문을 치운다. 그 차례에 이미 실제 과정이 붙었으면(앞 차례의 늦은 결과 등) 차례는 남기고 말풍선만 뺀다. */
  function dropPending() {
    if (!pending) return;
    clearTimeout(pending.timer); pending.bubble.remove();
    if (pending.turn.count === 0 && !pending.turn.answer) { pending.turn.el.remove(); if (turn === pending.turn) turn = null; }
    pending = null;
  }
  const liveText = () => activity || (opening ? LOADING : (pending ? SENDING : '생각 중'));
  /** 작업 중인데 진행 표시가 없으면(요청문만 놓인 차례) 다시 그린다 — 기록의 첫 요청문이 도착해 미리 그린 표시를 지운 직후가 대표적 */
  function ensureLive() {
    if (!busy && !awaiting) return;
    if (!turn) root.appendChild(newTurn());
    if (turn.count === 0 && !turn.answer) { turn.steps.classList.remove('settled'); turn.steps.hidden = false; showLive(liveText()); }
  }
  function render(all, meta) {
    const keep = !all?.length ? primed : null; // 기록이 아직 비었으면 미리 그린 요청문을 유지
    const wasOpening = opening;
    clear(); if (keep) { prime(keep); return; }
    items = all || [];
    opening = wasOpening && !items.some(it => it.kind !== 'user' && it.kind !== 'command');
    const start = Math.max(0, items.length - RENDER_WINDOW);
    for (let k = start; k < items.length; k++) place(items[k]);
    if (!busy) settleTurn();
    shown = items.length - start; unknownBanner(meta); root.scrollTop = root.scrollHeight; followBottom = true;
    ensureLive(); applySubs();
  }
  function append(more, meta) {
    if (!more?.length) return;
    if (primed) { const wasOpening = opening; clear(); opening = wasOpening; } // 진짜 기록이 도착 — 미리 그린 요청문은 치운다(중복 방지). "여는 중" 상태는 첫 답변 항목이 올 때까지 유지
    if (pending && more.some(it => it.kind === 'user')) dropPending(); // 기록의 요청문이 왔다 — 미리 그린 이어가기 요청문을 치우고 실제 기록으로 그린다
    items.push(...more); for (const it of more) place(it);
    if (opening && more.some(it => it.kind !== 'user' && it.kind !== 'command')) opening = false;
    if (awaiting && !pending && more.some(it => it.kind !== 'user' && it.kind !== 'command')) awaiting = false; // 첫 응답 항목 도착
    shown += more.length; unknownBanner(meta);
    ensureLive(); applySubs();
    if (followBottom) root.scrollTop = root.scrollHeight;
  }
  function showMore() {
    if (shown >= items.length) return;
    const end = items.length - shown, start = Math.max(0, end - RENDER_WINDOW);
    const frag = document.createDocumentFragment(); const saveTurn = turn; const saveChips = lastChips; turn = null;
    const tmp = document.createElement('div'); const saveRoot = root; root = tmp;
    for (let k = start; k < end; k++) place(items[k]); settleTurn();
    root = saveRoot; turn = saveTurn; lastChips = saveChips; while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    const prevH = root.scrollHeight; root.prepend(frag); shown += end - start; root.scrollTop += root.scrollHeight - prevH;
  }
  function unknownBanner(meta) {
    const n = meta?.unknown || 0; if (n === unknownCount) return; unknownCount = n;
    let b = root.querySelector('.unknown-banner');
    if (!b) { b = document.createElement('div'); b.className = 'unknown-banner'; root.prepend(b); }
    b.textContent = `알 수 없는 항목 ${n}개 (접힘)`;
  }
  /** 세션 상태: 작업 중이면 진행 표시를 살리고, 대기로 돌아오면 과정을 접는다 */
  function setBusy(b, act) {
    busy = b; activity = act || '';
    if (!b && (primed || awaiting)) return; // 세션 여는 중·요청 전달 직후엔 잠깐 대기로 보여도 표시를 내리지 않는다(CLI가 요청을 받기 전의 깜빡임)
    if (!turn) { if (b) root.appendChild(newTurn()); else return; }
    // 첫 답변 항목이 아직 없는 채로 작업 중 = CLI가 도구·컨텍스트를 불러오는 중이다(진짜 "생각 중"이 아님)
    if (b) { turn.steps.classList.remove('settled'); if (turn.count === 0 || activity) { turn.steps.hidden = false; showLive(liveText()); } }
    else { settleTurn(); if (turn.count === 0) turn.steps.hidden = true; }
  }
  return { mount, render, append, clear, prime, pend, md, setBusy, setSubagents, markSub, tick };
}
// ---- 보조 작업 칩·서랍이 함께 쓰는 표기(2026-09-11) ----
const SUB_STATUS_KO = { running: '작업 중', done: '완료', quiet: '조용함' };
function fmtDur(ms) {
  if (!(ms > 0)) return '0초';
  const s = Math.floor(ms / 1000); if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
/** 보조 한 건의 상태 글·경과 시간(작업 중 = 지금까지, 완료 = 걸린 시간, 조용함 = 마지막 기록까지) */
function subMeta(s) {
  const start = s.startedAt ? Date.parse(s.startedAt) : NaN;
  const end = s.status === 'done' ? (s.endedAt ? Date.parse(s.endedAt) : NaN) : s.status === 'quiet' ? (s.lastAt ? Date.parse(s.lastAt) : NaN) : Date.now();
  const elapsed = Number.isFinite(start) && Number.isFinite(end) ? fmtDur(end - start) : '';
  return { status: SUB_STATUS_KO[s.status] || s.status, elapsed };
}
window.Transcript = createTranscript();
window.Transcript.create = createTranscript;
window.Transcript.subMeta = subMeta;
window.Transcript.fmtDur = fmtDur;
