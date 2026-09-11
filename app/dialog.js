// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 화면 안 대화상자(알림·확인) — 브라우저의 alert()·confirm()을 쓰지 않는다.
   이유(2026-09-10 실증): Electron(윈도) 창에서 네이티브 alert/confirm 을 닫고 나면 창이 키보드 초점을 잃어
   입력창에 아무것도 쳐지지 않는다(document.hasFocus()=false, win.isFocused()=false). 전부 종료 후 재실행해야 풀리던
   "요청 입력 불가" 버그의 원인. 그래서 알림·확인은 전부 이 모듈(페이지 안 요소)로만 띄운다.
   사용: await Dialog.alert('…')  ·  if (!(await Dialog.confirm('…'))) return;
   window.alert 도 여기로 돌린다(누가 실수로 불러도 초점을 잃지 않게). confirm 은 동기 반환이 불가능해 덮어쓰지 않으니 코드에서 부르지 말 것. */
window.Dialog = (() => {
  const $ = (s) => document.querySelector(s);
  let queue = Promise.resolve(); // 여러 개가 겹치면 차례로
  function build() {
    let el = $('#dlg');
    if (el) return el;
    el = document.createElement('div'); el.id = 'dlg'; el.className = 'dlg'; el.hidden = true;
    el.innerHTML = `<div class="dlg-box" role="dialog" aria-modal="true" aria-labelledby="dlg-msg"><div id="dlg-title" class="dlg-title" hidden></div><div id="dlg-msg" class="dlg-msg"></div><div class="dlg-actions"><button id="dlg-cancel" class="text-btn">취소</button><button id="dlg-ok" class="text-btn accent">확인</button></div></div>`;
    document.body.appendChild(el);
    return el;
  }
  function open({ message, html, title, confirm, okLabel, cancelLabel, danger, wide }) {
    const el = build(); const prev = document.activeElement;
    return new Promise((resolve) => {
      // html 은 우리 코드가 만든 신뢰 문자열만(사용자·세션 출력은 message 로). info() 전용.
      if (html != null) $('#dlg-msg').innerHTML = html; else $('#dlg-msg').textContent = String(message ?? '');
      const tt = $('#dlg-title'); tt.textContent = title || ''; tt.hidden = !title;
      el.querySelector('.dlg-box').classList.toggle('wide', !!wide);
      const ok = $('#dlg-ok'), cancel = $('#dlg-cancel');
      ok.textContent = okLabel || '확인'; cancel.textContent = cancelLabel || '취소';
      cancel.hidden = !confirm; ok.classList.toggle('danger', !!danger);
      el.hidden = false;
      const done = (v) => {
        el.hidden = true; document.removeEventListener('keydown', onKey, true); ok.onclick = cancel.onclick = null; el.onclick = null;
        // 초점을 원래 자리로(입력창 등) — 창의 OS 초점은 잃은 적이 없으므로 이걸로 충분하다
        try { (prev && prev.isConnected ? prev : $('#composer-text'))?.focus(); } catch {}
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(!confirm ? true : false); }
        else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok && confirm ? cancel : ok).focus(); }
      };
      document.addEventListener('keydown', onKey, true);
      ok.onclick = () => done(true); cancel.onclick = () => done(false);
      el.onclick = (e) => { if (e.target === el && confirm) done(false); };
      ok.focus();
    });
  }
  const run = (opts) => { const p = queue.then(() => open(opts)); queue = p.catch(() => {}); return p; };
  const alert = (message) => run({ message, confirm: false });
  const confirm = (message, opts = {}) => run({ message, confirm: true, ...opts });
  /** 제목 + 여러 줄 본문(우리 코드가 만든 HTML)을 보여 주는 정보창. 예: 정보(만든 사람) 대화상자. */
  const info = ({ title, html, okLabel, wide }) => run({ title, html, okLabel: okLabel || '닫기', confirm: false, wide });
  window.alert = (m) => { alert(m); }; // 네이티브 alert 봉인(초점 상실 방지). 반환값을 기다리는 코드는 Dialog.alert 을 쓸 것
  return { alert, confirm, info, isOpen: () => { const el = $('#dlg'); return !!el && !el.hidden; } };
})();
