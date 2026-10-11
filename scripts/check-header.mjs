// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션 머리(#view-head) 말줄임 검사(v2.82, 2026-10-11 사용자 신고 "부제가 길면 대화/터미널 버튼이 세로로 밀림").
//   실제 app/index.html 의 몸통(스크립트 뺌)과 app/style.css 를 그대로 헤드리스 브라우저에 올리고, 창 폭(900·1280px)과
//   부제 길이(짧음 · 한글 80자 넘음 · 공백 없는 긴 경로)를 바꿔 가며 잰다.
//   1) 「대화」「터미널」 버튼은 한 줄 · 높이·가로 위치가 짧은 부제 때와 같다 · ⧉ ✕ 도 창 안
//   2) 머리 높이가 변하지 않는다 · 긴 부제는 말줄임(…) · 제목도 말줄임 · 컨텍스트 % 는 줄지 않는다
//   3) 위 머리줄(#top, 메모리 링 등)은 48px 그대로
//   4) 마우스를 올리면 전체 글: main.js 가 부제의 title 첫 줄에 화면 글 전체를 넣는다
// playwright 없으면 1~3 SKIP. IRIS_CAPTURE_DIR 를 주면 캡처 PNG 를 그 폴더에 남긴다. 데몬·CLI 접촉 0.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const app = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');

// 4) 툴팁 재료(정적 검사)
const mainJs = app('main.js');
ok('main.js: 부제 title 첫 줄 = 화면 글 전체', /\$\('#vh-combo'\)\.title\s*=\s*\[\s*\$\('#vh-combo'\)\.textContent/.test(mainJs), '부제 title 에 textContent 가 먼저 와야 함');

const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP renderer: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const body = app('index.html').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
  const css = app('style.css');
  const capDir = process.env.IRIS_CAPTURE_DIR || '';
  const LONG_KO = '화학 교재 제1권 화학적 설명의 기초 장 전체 점검과 코덱스 비판 반영 원고 수정 및 조판 빈칸 정리 작업을 이어서 진행하는 세션의 아주 긴 부제 예시 문장입니다';
  const LONG_PATH = 'D:\\Workspace\\Textbooks\\〖교재〗D05-전문화학(ExpertChemistry)\\P01-화학적설명의기초(FoundationsOfChemicalExplanation)\\S05-장전체점검(ChapterReview)\\T03-비판반영(CritiqueApplied)';
  const SUBS = { short: '화학 · Claude Opus 5.5 · xhigh · 대기', ko: `${LONG_KO} · Claude Opus 5.5 · xhigh · 작업 중`, path: `${LONG_PATH}·Claude·Opus5.5·xhigh·작업중` };
  const browser = await chromium.launch();
  try {
    const results = {};
    for (const w of [900, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 700 } });
      await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
      for (const [k, sub] of Object.entries(SUBS)) {
        results[`${w}:${k}`] = await page.evaluate(({ sub, k }) => {
          document.getElementById('view').hidden = false;
          document.getElementById('vh-title').textContent = k === 'short' ? '집필 이어가기' : '집필 이어가기 — 화학 1.5 장 마무리와 코덱스 비판 반영, 빈칸 조치까지 한 번에 끝내기';
          const combo = document.getElementById('vh-combo'); combo.textContent = sub;
          document.getElementById('vh-usage').textContent = '컨텍스트 42%';
          const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right }; };
          const cs = getComputedStyle(combo); const ts = getComputedStyle(document.getElementById('vh-title'));
          return { chat: r('btn-mode-chat'), term: r('btn-mode-term'), copy: r('btn-copy-resume'), close: r('btn-close'), usage: r('vh-usage'), head: r('view-head'),
            top: r('top').h, vw: document.documentElement.clientWidth,
            comboClipped: combo.scrollWidth > combo.clientWidth + 1, comboEllipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap',
            titleEllipsis: ts.textOverflow === 'ellipsis', usageFull: (() => { const u = document.getElementById('vh-usage'); return u.scrollWidth <= u.clientWidth + 1; })() };
        }, { sub, k });
        if (capDir) { fs.mkdirSync(capDir, { recursive: true }); await page.locator('#view-head').screenshot({ path: path.join(capDir, `머리-${w}px-${k}.png`) }); }
      }
      await page.close();
    }
    for (const w of [900, 1280]) {
      const base = results[`${w}:short`];
      for (const k of ['short', 'ko', 'path']) {
        const r = results[`${w}:${k}`]; const tag = `${w}px·${k}`;
        ok(`${tag}: 대화·터미널 한 줄(같은 높이 위치)`, Math.abs(r.chat.y - r.term.y) < 1 && Math.abs(r.chat.h - r.term.h) < 1, `${r.chat.y}/${r.term.y} ${r.chat.h}/${r.term.h}`);
        ok(`${tag}: 버튼 높이 = 짧은 부제 때`, Math.abs(r.chat.h - base.chat.h) < 1 && Math.abs(r.term.h - base.term.h) < 1, `${r.chat.h} vs ${base.chat.h}`);
        ok(`${tag}: 버튼 가로 위치 = 짧은 부제 때(오른쪽 고정)`, Math.abs(r.term.right - base.term.right) < 1 && Math.abs(r.chat.x - base.chat.x) < 1, `${r.term.right} vs ${base.term.right}`);
        ok(`${tag}: ⧉·✕ 창 안`, r.close.right <= r.vw + 0.5 && r.copy.w > 10 && r.close.w > 10, `${r.close.right}/${r.vw}`);
        ok(`${tag}: 머리 높이 = 짧은 부제 때`, Math.abs(r.head.h - base.head.h) < 1, `${r.head.h} vs ${base.head.h}`);
        ok(`${tag}: 컨텍스트 % 안 잘림`, r.usageFull);
        ok(`${tag}: 위 머리줄 48px`, Math.abs(r.top - 48) < 1, String(r.top));
        ok(`${tag}: 부제·제목 말줄임 스타일`, r.comboEllipsis && r.titleEllipsis);
        if (k !== 'short') ok(`${tag}: 긴 부제는 잘려 … 로 보임`, r.comboClipped);
      }
    }
  } finally { await browser.close(); }
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
