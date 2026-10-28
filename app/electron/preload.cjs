// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 창(렌더러) ↔ 메인 다리. 노출하는 것: 초점 되살리기 · Esc 중계 수신 · 트레이 "정보…" 수신 · 무대 실측 · 전부 종료(v2.97).
// refocus: 페이지가 "사용자가 창을 눌렀는데도 document.hasFocus()가 false" 를 감지하면 부른다 → 메인이 창을 blur→focus 해서
//   OS 키보드 초점을 되찾는다(네이티브 대화상자·다른 창 간섭 뒤 키 입력이 죽는 증상의 자가 복구, 2026-09-10).
// onEscape: 메인이 before-input-event로 잡은 Esc를 받는다(초점이 미리보기 iframe 안이라 페이지 keydown이 안 올 때도 중단이 되게, 2026-09-10).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('irisHost', {
  refocus: () => ipcRenderer.invoke('iris:refocus'),
  onEscape: (cb) => { ipcRenderer.on('iris:escape', () => { try { cb(); } catch {} }); },
  onAbout: (cb) => { ipcRenderer.on('iris:about', () => { try { cb(); } catch {} }); }, // 트레이 메뉴 "IRIS-Face 정보…" → 페이지의 정보 대화상자(2026-09-10 각인)
  // 무대 실측(2026-09-13, v2.51): 앱의 프로세스별 CPU%(GPU 프로세스·렌더러) — 별 애니메이션의 진짜 비용은 GPU 합성이라 페이지 안에서는 잴 수 없다
  metrics: () => ipcRenderer.invoke('iris:metrics'),
  // 전부 종료(v2.97): 화면 ⏻ → 메인의 quitAll() 한 길 / 창 × → 메인이 "닫아도 되나" 물음(cb 가 false 면 취소) / 종료 진행·취소 알림
  quitAll: () => ipcRenderer.invoke('iris:quit-all'),
  onCloseRequest: (cb) => { ipcRenderer.on('iris:close-request', async (_e, id) => {
    ipcRenderer.send('iris:close-ack', { id }); // 받았음 — 사용자가 확인 창에서 고르는 동안 메인이 기다린다
    let go = true; try { go = (await cb()) !== false; } catch {}
    ipcRenderer.send('iris:close-answer', { id, go });
  }); },
  onQuitting: (cb) => { ipcRenderer.on('iris:quitting', (_e, info) => { try { cb(info || {}); } catch {} }); },
  onQuitCancel: (cb) => { ipcRenderer.on('iris:quit-cancel', () => { try { cb(); } catch {} }); },
});
