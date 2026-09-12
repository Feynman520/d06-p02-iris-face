// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 확인 카드 파서(구현계획 v2.43 → v2.50, 2026-09-13): 노란불(확인 필요)일 때 터미널 화면 아래쪽 글자에서
   "대화상자 종류 + 제목·본문 + 질문 + 선택지 + 누를 키"를 뽑는다. 대화 화면은 이 결과로 카드를 그리고,
   버튼은 터미널 보기와 같은 웹소켓 `input`으로 키를 보낸다(새 통로 없음). 순수 함수(파일·프로세스 접촉 0).

   실측한 화면(2026-09-13, 클로드코드 2.1.269 · 코덱스 0.154.0 — 검사 = scripts/check-approval.mjs, npm run verify:approval):
   - 번호 선택지: `❯ 1. Yes` … (Bash 승인 · 계획 승인 · AskUserQuestion · 답 검토 · 코덱스 승인 `› 1. Yes, proceed (y)`)
     → 키 = 그 숫자(실측: 숫자 한 글자로 고르고 확정까지 됨). 선택지 아래 들여쓴 설명 줄(`     The color red`)은 desc 로 붙인다.
   - 다중 선택(AskUserQuestion multiSelect): `1. [ ] Apple` / `2. [✔] Pear` → 숫자 = 토글, Tab = 다음(마지막이면 답 검토 화면).
   - 번호 없는 선택지(폴더 신뢰 물음 `❯ No, exit` / `  Yes, I trust this folder`): 숫자 키가 없으므로
     키 = 화살표(↓/↑ × 거리) + Enter 를 한 번에 보낸다(실측 OK). 기본 선택이 "No, exit"라 Enter 만 보내면 세션이 꺼진다.
   - `(y/n)` 한 줄 물음 → y·n. 그 밖(모르는 형식) → raw: 원문 + Enter/Esc + 글 입력칸(화면이 붙인다).
   노란불 자체는 ATTENTION_RE(sessions.mjs)가 켜므로 여기서 판정하지 않는다. */

const ESC = '\x1b', ENTER = '\r', TAB = '\t', UP = '\x1b[A', DOWN = '\x1b[B';
const MARK = '(?:❯|›|»|▶|▌|>)';
const NUMBERED_RE = new RegExp(`^(\\s*)(${MARK})?\\s*(\\d{1,2})[.)]\\s+(?:\\[([ x✔✓●])\\]\\s+)?(\\S.*?)\\s*$`);
const LETTERED_RE = new RegExp(`^(\\s*)(${MARK})?\\s*(\\S.*?)\\s*\\((y|n|a|s|esc|enter)\\)\\s*$`, 'i');
const MARKED_RE = new RegExp(`^(\\s*)(${MARK})\\s+(\\S.*?)\\s*$`);
const YN_RE = /\((y\/n|Y\/n|y\/N)\)|\[(y\/n|Y\/n|y\/N)\]/;
const BORDER_ONLY_RE = /^[\s╭╮╰╯┌┐└┘├┤│┃|]*$/;
const DIVIDER_RE = /^[\s╭╮╰╯┌┐└┘├┤─━═╌▔▁]{8,}.*$/; // 상자 위·아래 모서리 줄(╭──╮)도 경계   // 가로줄(대화상자 위·아래 경계). 오른쪽에 작업 이름이 붙기도 한다(`──── create-hello-file ─`)
const STATUS_LINE_RE = /⏵⏵|⏸ manual mode|bypass permissions|shift\+tab to cycle|← for agents|esc to interrupt|ctrl\+c to interrupt|Enter to confirm|Esc to cancel|Enter to select|Tab to next|Tab to amend|Tab\/Arrow keys|↑\/↓ to navigate|Press enter to continue|ctrl\+g to edit|shift\+tab to approve|Security guide|\? for shortcuts/i;
const TABS_RE = /(?:^|\s)[☐☒]\s+\S/;                     // AskUserQuestion 머리줄: `←  ☐ Color  ☒ Fruit  ✔ Submit  →`
const TAB_ITEM_RE = /([☐☒])\s+([^☐☒✔←→]+?)(?=\s{2,}|\s*$)/g;
const QUESTION_MAX_LINES = 18, QUESTION_MAX_CHARS = 1600, MAX_DESC = 2;

/** 상자 좌우 세로줄을 걷어낸 한 줄. 상자만 있는 줄·빈 줄은 null, 가로줄은 {divider:true}. */
function cleanLine(raw) {
  const s = String(raw ?? '').replace(/\t/g, ' ').replace(/^\s*[│┃|]\s?/, '').replace(/\s?[│┃|]\s*$/, '').replace(/\s+$/, '');
  if (!s.trim() || BORDER_ONLY_RE.test(s)) return null;
  if (DIVIDER_RE.test(s)) return { divider: true };
  return s;
}
const keyFor = (tag) => { const t = tag.toLowerCase(); return t === 'esc' ? ESC : t === 'enter' ? ENTER : t; };

/** 한 줄이 선택지면 그 구조를, 아니면 null. numbered=숫자 키 · lettered=괄호 글자 키 · marked=번호 없이 ❯ 표시만 */
function parseOption(l) {
  let m = l.match(NUMBERED_RE);
  if (m) return { indent: m[1].length, selected: !!m[2], key: m[3], hotkey: m[3], label: m[5], checked: m[4] == null ? null : m[4] !== ' ', style: 'numbered' };
  m = l.match(LETTERED_RE);
  if (m) return { indent: m[1].length, selected: !!m[2], key: keyFor(m[4]), hotkey: m[4].toLowerCase(), label: `${m[3]} (${m[4]})`, checked: null, style: 'lettered' };
  return null;
}

/** 맨 아래에서 위로 올라가며 선택지 블록(설명 줄 포함)을 모은다. 돌려주는 top = 블록 첫 줄의 index(없으면 -1). */
function collectBlock(body) {
  let end = body.length - 1;
  const block = []; let pending = []; let top = -1;
  for (let i = end; i >= 0; i--) {
    const l = body[i];
    if (typeof l !== 'string') { // 가로줄: 블록 안(바로 위 줄도 선택지 — AskUserQuestion "Chat about this" 위)이면 건너뛰고, 아니면 블록 끝
      if (!block.length) continue;
      let j = i - 1, hop = 0; while (j >= 0 && hop < 3 && typeof body[j] === 'string' && !parseOption(body[j])) { j--; hop++; }
      if (j >= 0 && typeof body[j] === 'string' && parseOption(body[j])) continue; // 가로줄 위 1~3줄 안에 선택지가 있으면 같은 대화상자
      break;
    }
    const o = parseOption(l);
    if (o) { o.desc = pending.reverse().map(s => s.trim()).join(' '); pending = []; block.unshift(o); top = i; continue; }
    if (block.length === 0) { // 첫(맨 아래) 선택지보다 아래의 글: 짧은 꼬리 한 줄만 설명으로 허용(`     Submit`). 빈 프롬프트(❯)·문장이면 대화상자가 아니다
      if (pending.length >= 1 || new RegExp(`^\\s*${MARK}\\s*$`).test(l) || /[.?!。]$/.test(l.trim())) return { block: [], top: -1 };
      pending.push(l); continue;
    }
    if (pending.length >= MAX_DESC || /[?:]$/.test(l.trim())) break;
    pending.push(l);
  }
  return { block, top };
}

/** 번호 없는 ❯ 선택지(폴더 신뢰 물음): ❯ 줄 하나 + 같은 글자 열에서 시작하는 이웃 줄들. */
function collectMarked(body) {
  for (let i = body.length - 1; i >= Math.max(0, body.length - 8); i--) {
    const l = body[i]; if (typeof l !== 'string') continue;
    const m = l.match(MARKED_RE); if (!m || parseOption(l)) continue;
    const col = l.indexOf(m[3]);
    const ok = (s) => typeof s === 'string' && !parseOption(s) && s.length - s.trimStart().length === col && s.trim().length < 100 && !/[?:]$/.test(s.trim()) && !TABS_RE.test(s);
    let a = i, b = i;
    while (a - 1 >= 0 && ok(body[a - 1])) a--;
    while (b + 1 < body.length && ok(body[b + 1])) b++;
    const lines = body.slice(a, b + 1);
    if (lines.length < 2) continue;
    const sel = i - a;
    const options = lines.map((s, j) => ({ key: (j > sel ? DOWN.repeat(j - sel) : UP.repeat(sel - j)) + ENTER, hotkey: '', label: s.trim().replace(new RegExp(`^${MARK}\\s+`), ''), selected: j === sel, checked: null, desc: '' }));
    return { block: options, top: a };
  }
  return null;
}

/** 선택지 블록 위의 질문 영역: 가장 가까운 가로줄까지(계획 승인은 계획 본문까지 위로 더). 머리줄(☐ 탭)이 있으면 그 아래부터. */
function questionRegion(body, top) {
  const floor = Math.max(0, top - QUESTION_MAX_LINES);
  let start = -1;
  for (let i = top - 1; i >= floor; i--) if (typeof body[i] !== 'string') { start = i + 1; break; }
  if (start < 0) { // 가로줄이 없는 대화상자(코덱스): 첫 물음 줄부터 — 그 위는 대화 기록이다
    start = floor;
    for (let i = floor; i < top; i++) if (typeof body[i] === 'string' && /\?(\s|$)/.test(body[i])) { start = i; break; }
  }
  let lines = body.slice(start, top).filter(l => typeof l === 'string');
  const text = lines.join('\n');
  // 계획 승인: 가로줄 위에 "Here is Claude's plan:" 이 있으면 그 계획 본문까지 포함한다(사용자가 읽고 승인하는 대상)
  if (/Would you like to proceed\?/.test(text)) {
    for (let i = start - 1; i >= Math.max(0, start - 30); i--) {
      const l = body[i]; if (typeof l === 'string' && /Here is Claude's plan|Ready to code\?/.test(l)) { lines = body.slice(i, top).filter(x => typeof x === 'string'); break; }
    }
  }
  return lines;
}

function classify(regionText, options, tabs) {
  if (/Review your answers|Ready to submit/i.test(regionText)) return 'review';
  if (tabs) return 'ask';
  if (/trust/i.test(regionText) && /folder|directory|files/i.test(regionText)) return 'trust';
  if (/Here is Claude's plan|written up a plan|Ready to code/i.test(regionText)) return 'plan';
  if (/Bash command|Edit file|Write file|Create file|Read file|Do you want to proceed|Would you like to (?:run|make|allow)|requires approval|Apply proposed/i.test(regionText)) return 'permission';
  if (/Update available/i.test(regionText)) return 'update';
  return 'generic';
}

function parseTabs(line) {
  const tabs = []; let m; TAB_ITEM_RE.lastIndex = 0;
  while ((m = TAB_ITEM_RE.exec(line))) tabs.push({ label: m[2].trim(), done: m[1] === '☒' });
  return tabs.length ? tabs : null;
}

/** @returns {{kind:'choice'|'yn'|'raw', dialog:string, title:string, body:string, question:string, tabs:null|{label,done}[], multi:boolean,
 *            options:{key:string,hotkey:string,label:string,desc:string,selected:boolean,checked:boolean|null}[], actions:{key:string,hotkey:string,label:string}[]}} */
export function parseApproval(text) {
  const all = String(text ?? '').split('\n').map(cleanLine).filter(l => l !== null);
  const body = all.filter(l => typeof l !== 'string' || !STATUS_LINE_RE.test(l));
  let { block, top } = collectBlock(body);
  const numberedOk = block.length >= 2 && block.every(o => o.style === 'numbered') && block.every((o, k) => Number(o.key) === k + 1);
  const letteredOk = block.length >= 2 && block.every(o => o.style === 'lettered');
  let marked = null;
  if (!numberedOk && !letteredOk) { marked = collectMarked(body); if (marked) ({ block, top } = marked); }
  if (numberedOk || letteredOk || marked) {
    const region = questionRegion(body, top);
    const tabLine = region.find(l => TABS_RE.test(l));
    const tabs = tabLine ? parseTabs(tabLine) : null;
    const lines = tabLine ? region.slice(region.indexOf(tabLine) + 1) : region;
    const options = block.map(({ key, hotkey, label, desc, selected, checked }) => ({ key, hotkey: hotkey || '', label, desc: desc || '', selected: !!selected, checked }));
    if (!options.some(o => o.selected)) options[0].selected = true;
    const multi = options.some(o => o.checked !== null);
    const dialog = classify(lines.join('\n'), options, tabs);
    // 질문 = 영역의 마지막 물음표 줄(있으면). 그 위는 본문(명령·설명·계획), 첫 줄이 짧은 이름표면 제목.
    let qi = -1; for (let i = lines.length - 1; i >= 0; i--) if (/\?$/.test(lines[i].trim())) { qi = i; break; }
    if (qi < 0 && dialog === 'ask' && lines.length) qi = 0;
    const question = qi >= 0 ? lines[qi].trim() : '';
    let rest = qi >= 0 ? [...lines.slice(0, qi), ...lines.slice(qi + 1)] : lines; // 물음 줄 아래의 보충(Description·Destination)도 본문에 남긴다
    let title = '';
    const t0 = (rest[0] || '').trim();
    if (qi !== 0 && t0 && t0.length <= 40 && !/[.?!]$/.test(t0) && !/:./.test(t0) && (rest.length > 1 || dialog === 'permission')) { title = t0; rest = rest.slice(1); } // 제목은 물음보다 위에 있는 짧은 이름표(`Bash command`)
    const actions = [];
    if (multi) actions.push({ key: TAB, hotkey: 'Tab', label: '선택 완료 →' });
    return { kind: 'choice', dialog, title, body: trimText(rest), question, tabs, multi, options, actions };
  }
  const strings = body.filter(l => typeof l === 'string');
  const yn = strings.slice(-QUESTION_MAX_LINES).find(l => YN_RE.test(l));
  if (yn) return { kind: 'yn', dialog: 'generic', title: '', body: '', question: trimText(strings.slice(-QUESTION_MAX_LINES)), tabs: null, multi: false, options: [{ key: 'y', hotkey: 'y', label: 'Yes (y)', desc: '', selected: true, checked: null }, { key: 'n', hotkey: 'n', label: 'No (n)', desc: '', selected: false, checked: null }], actions: [] };
  const raw = all.filter(l => typeof l === 'string');
  return { kind: 'raw', dialog: 'generic', title: '', body: '', question: trimText(raw.slice(-12)), tabs: null, multi: false, options: [{ key: ENTER, hotkey: 'Enter', label: 'Enter', desc: '', selected: true, checked: null }, { key: ESC, hotkey: 'Esc', label: 'Esc', desc: '', selected: false, checked: null }], actions: [] };
}

function trimText(arr) {
  const q = arr.map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return q.length > QUESTION_MAX_CHARS ? '…' + q.slice(-QUESTION_MAX_CHARS) : q;
}
