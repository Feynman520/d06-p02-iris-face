// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 화면 안 대화상자(알림·확인) — 브라우저의 alert()·confirm()을 쓰지 않는다.
   이유(2026-09-10 실증): Electron(윈도) 창에서 네이티브 alert/confirm 을 닫고 나면 창이 키보드 초점을 잃어
   입력창에 아무것도 쳐지지 않는다(document.hasFocus()=false, win.isFocused()=false). 전부 종료 후 재실행해야 풀리던
   "요청 입력 불가" 버그의 원인. 그래서 알림·확인은 전부 이 모듈(페이지 안 요소)로만 띄운다.
   window.alert 도 여기로 돌린다(누가 실수로 불러도 초점을 잃지 않게). confirm 은 동기 반환이 불가능해 덮어쓰지 않으니 코드에서 부르지 말 것.

   모양(2026-11-24 사용자 선택 = 시안 A 「가운데 카드」, docs\시안-안내창-2026-11-24.html):
     종류 아이콘 + 묻는 말 한 문장(제목) → 짧은 설명 → 「닫히는 것 / 남는 것」 표 → 단추(하는 일의 이름).
   사용:
     await Dialog.alert('…')                                    확인 하나(읽어야 하는 안내)
     if (!(await Dialog.confirm('설명', { title: '…할까요?', okLabel: '설치' }))) return;
       opts = { title, kind: 'ask'|'danger'|'warn'|'error'|'info', icon, okLabel, cancelLabel, danger,
                tag: '어느 것인지 이름', ledger: [['end'|'keep'|'', '닫히는 것', '…'], …], detail: '원래 오류 글',
                extra: '세 번째 단추 글' (누르면 'extra' 를 돌려준다), html, wide }
     await Dialog.error({ title, message, detail, retryLabel })  실패 알림 — retryLabel 이 있으면 「다시 시도」를 눌렀을 때 true
     Dialog.notice('…', { sub, tone })                           고를 것이 없는 알림 — 창으로 막지 않고 육각 단추의 말풍선으로(없으면 alert)
   제목을 주지 않으면 글의 첫 줄(60자 이하)이 제목이 된다. 키: Enter = 주 단추 · Esc = 취소(알림은 닫기) · Tab = 단추 사이. */
window.Dialog = (() => {
  const $ = (s) => document.querySelector(s);
  let queue = Promise.resolve(); // 여러 개가 겹치면 차례로
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    ask: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9"/><path d="M12 16.8v.1"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>'),
    warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/>'),
    error: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.1"/>'),
    power: svg('<path d="M12 3v9"/><path d="M6.3 7.2a8 8 0 1 0 11.4 0"/>'),
    download: svg('<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
    close: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>'),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
    busy: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  };
  const KIND_ICON = { ask: 'ask', danger: 'warn', warn: 'warn', error: 'error', info: 'info', busy: 'busy' };
  function build() {
    let el = $('#dlg');
    if (el) return el;
    el = document.createElement('div'); el.id = 'dlg'; el.className = 'dlg'; el.hidden = true;
    el.innerHTML = '<div class="dlg-box" role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">'
      + '<div class="dlg-head"><span id="dlg-ico" class="dlg-ico"></span><div id="dlg-title" class="dlg-title"></div></div>'
      + '<div id="dlg-msg" class="dlg-msg"></div>'
      + '<span id="dlg-tag" class="dlg-tag" hidden></span>'
      + '<dl id="dlg-ledger" class="dlg-ledger" hidden></dl>'
      + '<details id="dlg-detail" class="dlg-detail" hidden><summary>자세히</summary><pre></pre></details>'
      + '<div class="dlg-actions"><span id="dlg-keys" class="dlg-keys"></span><button id="dlg-extra" class="dlg-btn ghost" hidden></button><button id="dlg-cancel" class="dlg-btn">취소</button><button id="dlg-ok" class="dlg-btn pri">확인</button></div></div>';
    document.body.appendChild(el);
    return el;
  }
  /** 제목이 없으면 글의 첫 줄(60자 이하)을 제목으로 올린다 — 옛 호출(글 하나)도 "묻는 말 한 줄 + 설명" 모양이 되게 */
  function split(title, message) {
    if (title) return { title: String(title), body: String(message ?? '') };
    const text = String(message ?? ''); const nl = text.indexOf('\n'); const first = (nl < 0 ? text : text.slice(0, nl)).trim();
    if (first && first.length <= 60) return { title: first, body: nl < 0 ? '' : text.slice(nl + 1).trim() };
    return { title: '', body: text };
  }
  function open({ message, html, title, confirm, okLabel, cancelLabel, danger, wide, kind, icon, tag, ledger, detail, extra }) {
    const el = build(); const prev = document.activeElement;
    return new Promise((resolve) => {
      const k = kind || (danger ? 'danger' : confirm ? 'ask' : 'info');
      const box = el.querySelector('.dlg-box'); box.dataset.kind = k; box.classList.toggle('wide', !!wide);
      box.setAttribute('role', k === 'error' || k === 'warn' ? 'alertdialog' : 'dialog');
      // html 은 우리 코드가 만든 신뢰 문자열만(사용자·세션 출력은 message 로)
      const s = html != null ? { title: title ? String(title) : '', body: '' } : split(title, message);
      const msg = $('#dlg-msg');
      if (html != null) msg.innerHTML = html; else msg.textContent = s.body;
      msg.hidden = html == null && !s.body;
      const tt = $('#dlg-title'); tt.textContent = s.title; el.querySelector('.dlg-head').hidden = !s.title;
      $('#dlg-ico').innerHTML = ICONS[icon] || ICONS[KIND_ICON[k]] || ICONS.info;
      const tg = $('#dlg-tag'); tg.textContent = tag ? String(tag) : ''; tg.hidden = !tag;
      const lg = $('#dlg-ledger'); lg.textContent = ''; lg.hidden = !(ledger && ledger.length);
      for (const row of ledger || []) {
        const d = document.createElement('div'); if (row[0]) d.className = row[0];
        const dt = document.createElement('dt'); dt.textContent = String(row[1] ?? ''); const dd = document.createElement('dd'); dd.textContent = String(row[2] ?? '');
        d.append(dt, dd); lg.appendChild(d);
      }
      const dt = $('#dlg-detail'); dt.open = false; dt.hidden = !detail; dt.querySelector('pre').textContent = detail ? String(detail) : '';
      const ok = $('#dlg-ok'), cancel = $('#dlg-cancel'), ex = $('#dlg-extra');
      ok.textContent = okLabel || (confirm ? '확인' : '닫기'); cancel.textContent = cancelLabel || '취소';
      cancel.hidden = !confirm; ok.classList.toggle('danger', !!danger);
      ex.textContent = extra ? String(extra) : ''; ex.hidden = !extra;
      const keys = $('#dlg-keys'); keys.textContent = '';
      if (!extra) {
        const key = (name, label) => { const kb = document.createElement('kbd'); kb.textContent = name; keys.append(kb, ` ${label} `); };
        key('Enter', ok.textContent); if (confirm) key('Esc', cancel.textContent);
      }
      el.hidden = false;
      const done = (v) => {
        el.hidden = true; document.removeEventListener('keydown', onKey, true); ok.onclick = cancel.onclick = ex.onclick = null; el.onclick = null;
        // 초점을 원래 자리로(입력창 등) — 창의 OS 초점은 잃은 적이 없으므로 이걸로 충분하다
        try { (prev && prev.isConnected ? prev : $('#composer-text'))?.focus(); } catch {}
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(document.activeElement === ex && extra ? 'extra' : document.activeElement === cancel && confirm ? false : true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(!confirm ? true : false); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const ring = [extra ? ex : null, confirm ? cancel : null, ok].filter(Boolean); const i = ring.indexOf(document.activeElement);
          ring[(i + (e.shiftKey ? ring.length - 1 : 1)) % ring.length].focus();
        }
      };
      document.addEventListener('keydown', onKey, true);
      ok.onclick = () => done(true); cancel.onclick = () => done(false); ex.onclick = () => done('extra');
      el.onclick = (e) => { if (e.target === el && confirm) done(false); };
      ok.focus();
    });
  }
  const run = (opts) => { const p = queue.then(() => open(opts)); queue = p.catch(() => {}); return p; };
  const alert = (message, opts = {}) => run({ message, ...opts, confirm: false });
  const confirm = (message, opts = {}) => run({ message, confirm: true, ...opts });
  /** 제목 + 여러 줄 본문(우리 코드가 만든 HTML)을 보여 주는 정보창. 예: 정보(만든 사람) 대화상자. */
  const info = ({ title, html, okLabel, wide }) => run({ title, html, okLabel: okLabel || '닫기', confirm: false, wide, kind: 'info' });
  /** 실패 알림: 무엇이 안 됐는지(title) → 왜 · 무엇을 하면 되는지(message) → 원래 오류 글(detail, 접혀 있음). retryLabel 을 주면 그 단추를 눌렀을 때 true. */
  const error = ({ title, message, detail, retryLabel }) => run({ title, message: message || '', detail, kind: 'error', confirm: !!retryLabel, okLabel: retryLabel || '닫기', cancelLabel: '닫기' })
    .then((v) => (retryLabel ? v === true : false));
  /** 고를 것이 없는 알림: 창으로 막지 않는다(2026-11-24). 육각 단추의 말풍선으로 말하고 몇 초 뒤 사라진다 — 말풍선을 쓸 수 없으면 알림 창으로. */
  function notice(text, { sub = '', tone = 'warn' } = {}) {
    try {
      if (window.Planner && typeof window.Planner.say === 'function') { window.Planner.say({ group: 'info', tone, text: String(text), sub: sub ? String(sub) : '' }); return Promise.resolve(true); }
    } catch {}
    return alert(sub ? `${text}\n${sub}` : String(text));
  }
  window.alert = (m) => { alert(m); }; // 네이티브 alert 봉인(초점 상실 방지). 반환값을 기다리는 코드는 Dialog.alert 을 쓸 것
  return { alert, confirm, info, error, notice, icon: (name) => ICONS[name] || '', isOpen: () => { const el = $('#dlg'); return !!el && !el.hidden; } };
})();
