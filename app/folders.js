// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 폴더 선택 팝오버: 입력창의 폴더 아이콘 → 트리(R → D → P) + 검색 + 최근. 선택하면 onPick(folder). */
window.FolderPicker = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let data = null, onPick = null, open = false, expanded = new Set(), byPath = new Map(), tree = [];

  async function load() {
    const r = await fetch('/api/folders'); data = await r.json();
    byPath = new Map(); tree = [];
    const nodes = [data.root, ...data.folders];
    for (const f of nodes) { f.children = []; byPath.set(f.rel, f); }
    for (const f of data.folders) {
      const parentRel = f.rel.split('\\').slice(0, -1).join('\\');
      const parent = byPath.get(parentRel);
      if (parent) parent.children.push(f); else tree.push(f);
    }
    // 루트(rel '') 바로 아래가 R 폴더들 → 최상위. 그룹 접두 〖…〗D 는 이름으로만 존재 → 그대로 형제로 둔다.
    tree = [...(data.root.children || []), ...tree];
    const sortRec = (arr) => { arr.sort((a, b) => a.name.localeCompare(b.name, 'ko')); arr.forEach(c => sortRec(c.children)); };
    sortRec(tree);
    $('#fp-fresh').className = 'fp-fresh ' + (data.fresh?.fresh == null ? '' : data.fresh.fresh ? 'ok' : 'warn'); // null = 검사 도구 없음(회색, 경고 아님)
    $('#fp-fresh').title = data.fresh?.message || '';
  }
  const TYPE = { role: 'R', domain: 'D', project: 'P', root: '·' };
  function liveOf(f) { return (data.live || {})[f.path.toLowerCase()] || []; }
  function row(f, depth, hasKids) {
    const live = liveOf(f);
    const isOpen = expanded.has(f.rel);
    return `<div class="fp-row" data-rel="${esc(f.rel)}" style="--d:${depth}">
      <button class="fp-tw${hasKids ? '' : ' empty'}" data-tw="${esc(f.rel)}" tabindex="-1">${hasKids ? (isOpen ? '▾' : '▸') : ''}</button>
      <span class="fp-type ${f.type}">${TYPE[f.type] || '·'}</span>
      <span class="fp-name">${esc(f.name)}</span>
      ${f.lifecycle === 'dormant' ? '<span class="fp-tag">휴면</span>' : ''}${live.length ? `<span class="fp-tag live">● ${live.length}</span>` : ''}
    </div>`;
  }
  function renderTree() {
    const out = [];
    const walk = (f, depth) => { const kids = f.children || []; out.push(row(f, depth, kids.length > 0)); if (expanded.has(f.rel)) for (const c of kids) walk(c, depth + 1); };
    out.push(row(data.root, 0, false));
    for (const f of tree) walk(f, 0);
    $('#fp-list').innerHTML = out.join('');
  }
  function renderSearch(q) {
    const tokens = q.toLowerCase().split(/[\s,\/\\]+/).filter(Boolean);
    const score = (f) => { const hay = (f.rel + ' ' + f.name).toLowerCase(); const codes = (f.codes || []).map(c => c.toLowerCase()); let s = 0;
      for (const t of tokens) { if (/^[rdpst]\d{2}$/.test(t)) { if (codes.includes(t)) s += 5; else return 0; } else if (f.name.toLowerCase().includes(t)) s += 3; else if (hay.includes(t)) s += 1; else return 0; }
      return s + (f.type === 'project' ? 0.5 : 0); };
    const hits = data.folders.map(f => [score(f), f]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(([, f]) => f);
    $('#fp-list').innerHTML = hits.length ? hits.map(f => `<div class="fp-row hit" data-rel="${esc(f.rel)}" style="--d:0"><span class="fp-tw empty"></span><span class="fp-type ${f.type}">${TYPE[f.type]}</span><span class="fp-name">${esc(f.name)}</span><span class="fp-path">${esc(f.rel.split('\\').slice(0, -1).join(' › '))}</span>${liveOf(f).length ? `<span class="fp-tag live">● ${liveOf(f).length}</span>` : ''}</div>`).join('') : '<div class="fp-empty">일치하는 폴더가 없습니다</div>';
  }
  function renderRecent() {
    const rec = (data.recent || []).map(p => [...byPath.values()].find(f => f.path.toLowerCase() === p.toLowerCase())).filter(Boolean);
    $('#fp-recent').innerHTML = rec.map(f => `<button class="fp-chip" data-rel="${esc(f.rel)}" title="${esc(f.path)}">${esc(f.name)}</button>`).join('');
    $('#fp-recent').hidden = !rec.length;
  }
  function pick(rel) { const f = byPath.get(rel); if (!f) return; hide(); onPick?.(f); }
  function expandTo(rel) { const parts = rel.split('\\'); for (let i = 1; i < parts.length; i++) expanded.add(parts.slice(0, i).join('\\')); }
  async function show(currentRel) {
    open = true; $('#fp').hidden = false; $('#btn-folder').classList.add('active');
    $('#fp-list').innerHTML = '<div class="fp-empty">불러오는 중 …</div>';
    await load(); if (currentRel) expandTo(currentRel);
    renderRecent(); renderTree(); $('#fp-search').value = ''; $('#fp-search').focus();
    if (currentRel) $(`.fp-row[data-rel="${CSS.escape(currentRel)}"]`)?.scrollIntoView({ block: 'center' });
  }
  function hide() { open = false; $('#fp').hidden = true; $('#btn-folder').classList.remove('active'); }
  function init(opts) {
    onPick = opts.onPick;
    $('#fp-search').addEventListener('input', (e) => { const q = e.target.value.trim(); if (q) renderSearch(q); else renderTree(); });
    $('#fp-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = $('#fp-list .fp-row.hit') || $('#fp-list .fp-row'); if (first) pick(first.dataset.rel); } if (e.key === 'Escape') { e.stopPropagation(); hide(); } });
    $('#fp-list').addEventListener('click', (e) => {
      const tw = e.target.closest('[data-tw]'); if (tw) { const rel = tw.dataset.tw; expanded.has(rel) ? expanded.delete(rel) : expanded.add(rel); renderTree(); return; }
      const r = e.target.closest('.fp-row'); if (r) pick(r.dataset.rel);
    });
    $('#fp-list').addEventListener('dblclick', (e) => { const r = e.target.closest('.fp-row'); if (r && !r.classList.contains('hit')) { const rel = r.dataset.rel; expanded.has(rel) ? expanded.delete(rel) : expanded.add(rel); renderTree(); } });
    $('#fp-recent').addEventListener('click', (e) => { const c = e.target.closest('.fp-chip'); if (c) pick(c.dataset.rel); });
    document.addEventListener('pointerdown', (e) => { if (open && !e.target.closest('#fp') && !e.target.closest('#btn-folder')) hide(); });
  }
  return { init, show, hide, isOpen: () => open, toggle: (rel) => open ? hide() : show(rel) };
})();
