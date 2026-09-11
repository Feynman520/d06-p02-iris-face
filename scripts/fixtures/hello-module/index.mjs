// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 계약 v1 시험용 모듈. stdin 으로 hello/shutdown 을 받고, stdout 으로 panel/badge/notify 를 보낸다. 화면은 127.0.0.1 임의 포트 + 1회용 토큰.
import http from 'node:http';
import readline from 'node:readline';
import crypto from 'node:crypto';

const token = crypto.randomBytes(8).toString('hex');
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let hello = null;
const page = () => `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;font:14px system-ui;color:#dfe5ee;background:#141820">
<h2 style="margin:0 0 8px">Hello module</h2><p>계약 v1 시험용. Face 버전 ${hello?.face || '?'} · 테마 ${hello?.theme?.id || '?'} · state: <code>${hello?.stateDir || '?'}</code></p>
<button id="n" style="padding:6px 12px">알림 보내기</button> <button id="b" style="padding:6px 12px">배지 +1</button>
<script>let c=0;document.getElementById('n').onclick=()=>fetch('/notify?t=${token}',{method:'POST'});document.getElementById('b').onclick=()=>fetch('/badge?t=${token}&n='+(++c),{method:'POST'});</script>`;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.searchParams.get('t') !== token) { res.writeHead(403); return res.end(); }
  if (req.method === 'POST' && u.pathname === '/notify') { out({ t: 'notify', title: 'Hello 모듈', sub: '시험 알림입니다', target: 'hello:1' }); res.writeHead(204); return res.end(); }
  if (req.method === 'POST' && u.pathname === '/badge') { out({ t: 'badge', count: Number(u.searchParams.get('n')) || 0 }); res.writeHead(204); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page());
});
srv.listen(0, '127.0.0.1', () => out({ t: 'panel', url: `http://127.0.0.1:${srv.address().port}/?t=${token}` }));
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  let m; try { m = JSON.parse(l); } catch { return; }
  if (m.t === 'hello') { hello = m; out({ t: 'badge', count: 0 }); }
  if (m.t === 'shutdown') { srv.close(); process.exit(0); }
});
process.stdin.on('end', () => process.exit(0));
