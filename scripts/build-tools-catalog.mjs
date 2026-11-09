// 도구 카탈로그 작성 도구(판 B, 2026-11-10) — 개발 PC 전용, 앱에 들어가지 않는다(scripts 는 창 zip 제외).
// 후보(아래 CANDIDATES)마다 고정 커밋의 codeload zip 을 받아 하위 폴더를 꺼내고 트리 해시를 계산한 뒤,
// 플러그인이면 안의 실행 장치(.mcp.json·hooks·명령)를 보고서로 보여 준다. 사람이 보고서를 보고 tested 를 채운다.
//   node scripts/build-tools-catalog.mjs [--cache <폴더>] [--out <초안.json>]
import fs from 'node:fs';
import path from 'node:path';
import { extractSubtree, treeHash } from '../daemon/toolcatalog.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const CACHE = arg('--cache', path.join(process.env.TEMP || '.', 'iris-tools-cache'));
const OUT = arg('--out', null);
fs.mkdirSync(CACHE, { recursive: true });

const SKILLS = 'anthropics/skills@2c5958ecac7cee2b583967a2c4981d0f4a75c579';
const CMKT = 'anthropics/claude-plugins-official@0412be76f50ab4f4f8abff3753efa9269fbbca5b';
const OMKT = 'openai/plugins@d420d13051bffe4543ed39e30fa46b87148e47dd';

export const CANDIDATES = [
  { id: 'canvas-design', kind: 'skill', agents: ['claude', 'codex'], src: SKILLS, path: 'skills/canvas-design' },
  { id: 'internal-comms', kind: 'skill', agents: ['claude', 'codex'], src: SKILLS, path: 'skills/internal-comms' },
  { id: 'theme-factory', kind: 'skill', agents: ['claude', 'codex'], src: SKILLS, path: 'skills/theme-factory' },
  { id: 'skill-creator', kind: 'skill', agents: ['claude'], src: SKILLS, path: 'skills/skill-creator' },
  { id: 'context7', kind: 'mcp', agents: ['claude', 'codex'], url: 'https://mcp.context7.com/mcp' },
  { id: 'notion', kind: 'plugin', claude: { src: 'makenotion/claude-code-notion-plugin@9847f2aa1a15f25df35ed1fb7b4557dbb60cd651', path: '.', plugin: 'notion' }, codex: { src: OMKT, path: 'plugins/notion', plugin: 'notion' } },
  { id: 'github', kind: 'plugin', codex: { src: OMKT, path: 'plugins/github', plugin: 'github' } },
  { id: 'google-calendar', kind: 'plugin', codex: { src: OMKT, path: 'plugins/google-calendar', plugin: 'google-calendar' } },
  { id: 'gmail', kind: 'plugin', codex: { src: OMKT, path: 'plugins/gmail', plugin: 'gmail' } },
  { id: 'google-drive', kind: 'plugin', codex: { src: OMKT, path: 'plugins/google-drive', plugin: 'google-drive' } },
];

async function zipOf(src) {
  const [repo, commit] = src.split('@');
  const file = path.join(CACHE, `${repo.replace('/', '__')}-${commit}.zip`);
  if (!fs.existsSync(file)) {
    const r = await fetch(`https://codeload.github.com/${repo}/zip/${commit}`);
    if (!r.ok) throw new Error(`download ${src}: HTTP ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return { repo, commit, buf: fs.readFileSync(file) };
}

function inspectPlugin(files) {
  const names = files.map((f) => f.path);
  const read = (p) => { const f = files.find((x) => x.path === p); return f ? f.data.toString('utf8') : null; };
  const notes = [];
  for (const p of names.filter((n) => /(^|\/)\.mcp\.json$|(^|\/)\.app\.json$/.test(n))) notes.push(`${p}: ${read(p).replace(/\s+/g, ' ').slice(0, 400)}`);
  for (const p of names.filter((n) => /(^|\/)hooks(\/|\.json$)/.test(n))) notes.push(`hooks: ${p}`);
  for (const p of names.filter((n) => /\.(sh|ps1|cmd|bat|exe)$/i.test(n))) notes.push(`script: ${p}`);
  const unpinned = notes.filter((n) => /npx|uvx|@latest/.test(n) && !/@\d+\.\d+\.\d+/.test(n));
  return { notes, unpinned: unpinned.length > 0 };
}

const draft = [];
for (const c of CANDIDATES) {
  if (c.kind === 'mcp') {
    console.log(`
[mcp] ${c.id}  url=${c.url}`);
    draft.push({ id: c.id, kind: 'mcp', agents: c.agents, install: { via: 'http', url: c.url } });
    continue;
  }
  if (c.kind === 'skill') {
    const z = await zipOf(c.src);
    const files = extractSubtree(z.buf, c.path);
    const h = treeHash(files);
    const md = files.find((f) => f.path === 'SKILL.md');
    const lic = files.find((f) => /^LICENSE/i.test(f.path));
    console.log(`\n[skill] ${c.id}  files=${files.length}  tree=${h}  SKILL.md=${!!md}  license=${lic ? lic.data.toString('utf8').split('\n')[0].trim() : 'NONE'}`);
    console.log(`  scripts: ${files.filter((f) => /\.(sh|py|js|ps1)$/.test(f.path)).map((f) => f.path).join(', ') || '-'}`);
    draft.push({ id: c.id, kind: 'skill', agents: c.agents, install: { repo: z.repo, commit: z.commit, path: c.path, treeSha256: h } });
  } else {
    const item = { id: c.id, kind: 'plugin', agents: [], install: {} };
    for (const a of ['claude', 'codex']) {
      const p = c[a]; if (!p) continue;
      const z = await zipOf(p.src);
      const files = extractSubtree(z.buf, p.path === '.' ? '' : p.path);
      const h = treeHash(files);
      const ins = inspectPlugin(files);
      console.log(`\n[plugin:${a}] ${c.id}  files=${files.length}  tree=${h}  ${ins.unpinned ? 'UNPINNED-RUNTIME' : 'pinned/remote'}`);
      for (const n of ins.notes) console.log(`  ${n}`);
      item.agents.push(a);
      const spec = { repo: z.repo, commit: z.commit, path: p.path, plugin: p.plugin, treeSha256: h };
      if (ins.unpinned) spec.unpinned = true;
      if (a === 'codex') { // 코덱스 로컬 마켓에 그대로 옮겨 적을 원본 항목(정책·분류 칸) — source 는 엔진이 바꾼다
        const mk = JSON.parse(extractSubtree(z.buf, '.agents/plugins').find((f) => f.path === 'marketplace.json').data.toString('utf8'));
        const ent = (mk.plugins || []).find((x) => x.name === p.plugin);
        if (!ent) throw new Error(`codex marketplace has no ${p.plugin}`);
        const { source, ...rest } = ent; spec.entry = rest;
      }
      item.install[a] = spec;
    }
    draft.push(item);
  }
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(draft, null, 2), 'utf8'); console.log(`\ndraft → ${OUT}`); }
