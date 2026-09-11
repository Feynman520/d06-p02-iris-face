// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 영혼 폴더(작업공간 루트) 찾기 + 화면 설정 저장.
// 다른 사용자가 Face를 설치해도 자기 영혼 폴더 이름이 헤더가 되도록, Face 폴더에서 위로 올라가며
// `_ontology\graph.json` 또는 `_agent\` 가 있는 폴더를 루트로 삼는다. 환경변수 IRIS_ROOT 가 있으면 그것이 우선.
import fs from 'node:fs';
import path from 'node:path';

export function findRoot(from) {
  if (process.env.IRIS_ROOT && fs.existsSync(process.env.IRIS_ROOT)) return path.resolve(process.env.IRIS_ROOT);
  let dir = path.resolve(from);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '_ontology', 'graph.json')) || fs.existsSync(path.join(dir, '_agent'))) return dir;
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return path.resolve(from);
}
export const rootName = (root) => path.basename(root) || root;

export class Settings {
  constructor(stateDir) { this.file = path.join(stateDir, 'settings.json'); try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = {}; } }
  get() { return this.data; }
  set(patch) { this.data = { ...this.data, ...patch, updatedAt: new Date().toISOString() }; fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8'); return this.data; }
}
