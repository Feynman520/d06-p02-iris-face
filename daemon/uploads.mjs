// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 첨부 보관 정리: state/uploads 에 쌓인 첨부(버튼·끌어다 놓기·붙여넣기·카메라) 가운데 정해진 날수보다 오래된 파일을 지운다.
// 첨부는 요청문에 경로로만 들어가므로 원본은 사용자 쪽에 남지만, 화면 캡처·카메라 사진은 여기에만 있다 — 그래서 바로 지우지 않고 30일 둔다.
// 데몬이 시작할 때와 하루 한 번 부른다(server.mjs). 하위 폴더·링크는 건드리지 않는다.
import fs from 'node:fs';
import path from 'node:path';

export const UPLOAD_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** dir 안의 파일 중 마지막 수정이 days 일보다 오래된 것을 지운다. 돌려주는 값 = { removed, bytes, kept }. */
export function sweepUploads(dir, { days = UPLOAD_KEEP_DAYS, now = Date.now() } = {}) {
  const out = { removed: 0, bytes: 0, kept: 0 };
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; } // 아직 첨부한 적 없음
  for (const name of names) {
    const file = path.join(dir, name);
    let st; try { st = fs.lstatSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    if (now - st.mtimeMs <= days * DAY_MS) { out.kept++; continue; }
    try { fs.unlinkSync(file); out.removed++; out.bytes += st.size; } catch { out.kept++; } // 다른 프로그램이 열고 있으면 다음 차례에
  }
  return out;
}
