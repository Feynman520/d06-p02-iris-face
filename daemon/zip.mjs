// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 최소 zip 읽기/쓰기(모듈 설치 전용, 외부 의존 0). 읽기: 저장(0)·deflate(8). 쓰기: 저장(0)·deflate(8). ZIP64 미지원(모듈 zip은 수 MB).
// v2.58: 수백 MB 짜리 설치 패키지도 다루므로 **파일에서 바로 읽는 길**(zipOpenFile·zipEntryDataFile)을 함께 둔다 — 통째로 메모리에 올리지 않는다.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_EOCD = 0x06054b50;
const MAX_CD_BYTES = 64 * 1024 * 1024;   // 중앙 디렉터리 자체의 상한(항목 6만 개라도 수 MB)

// 폭탄 방어 기본 상한(설계 조각 F1) — 호출자가 zipRead(buf, opts)로 덮어쓸 수 있다.
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_ENTRIES = 10000;

function findEocd(buf) {
  // Finds the last EOCD signature; does not validate comment-length field (minimal parser limitation).
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  throw new Error('not a zip (no end-of-central-directory)');
}

/** 중앙 디렉터리만 훑어 항목 목록을 만든다(압축 해제 없음, 폴더 항목 포함). [{ name, method, csize, usize, start }].
 *  큰 zip(구조판 설치 패키지)에서 이름 검사·항목 하나 꺼내기를 통째 메모리 해제 없이 하려고 분리했다(v2.58).
 *  opts: { maxEntryBytes, maxTotalBytes, maxEntries } — 선언된 usize 기준 폭탄 방어.
 *  opts.strictLocal: 로컬 헤더의 method 가 중앙 디렉터리와 다르면 거부(보통 zip 도구가 못 푸는 zip). 업데이트 검증에서 쓴다. */
export function zipIndex(buf, opts = {}) {
  const maxEntryBytes = opts.maxEntryBytes ?? MAX_ENTRY_BYTES, maxTotalBytes = opts.maxTotalBytes ?? MAX_TOTAL_BYTES, maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('not a zip (too short)');
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  if (count > maxEntries) throw new Error('too many entries');
  let off = buf.readUInt32LE(eocd + 16);
  const out = []; let total = 0;
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== SIG_CENTRAL) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    if (off + 46 + nlen > buf.length) throw new Error('bad central directory (name length)');
    const name = buf.subarray(off + 46, off + 46 + nlen).toString('utf8');
    if (usize > maxEntryBytes) throw new Error(`entry too large: ${name} (${usize} bytes)`);
    total += usize; if (total > maxTotalBytes) throw new Error('zip too large (total)');
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LOCAL) throw new Error(`bad local header: ${name}`);
    const localMethod = buf.readUInt16LE(lho + 8);
    if (opts.strictLocal && localMethod !== method) throw new Error(`local header method mismatch: ${name} (local ${localMethod}, central ${method})`);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (start + csize > buf.length) throw new Error(`truncated entry: ${name}`);
    out.push({ name, method, localMethod, csize, usize, start });
    off += 46 + nlen + xlen + clen;
  }
  return out;
}

/** 압축된 바이트 한 덩이 → 원본. 선언 크기와 다르면 오류(위조 usize 방어). */
function inflateEntry(raw, e) {
  let data;
  if (e.method === 0) data = Buffer.from(raw);
  else if (e.method === 8) { try { data = zlib.inflateRawSync(raw, { maxOutputLength: e.usize }); } catch (err) { if (err instanceof RangeError || err.code === 'ERR_BUFFER_TOO_LARGE') throw new Error(`inflate exceeded declared size: ${e.name}`); throw err; } }
  else throw new Error(`unsupported compression method ${e.method}: ${e.name}`);
  if (data.length !== e.usize) throw new Error(`size mismatch: ${e.name}`);
  return data;
}

/** zipIndex 항목 하나만 압축 해제. 선언 크기와 다르면 오류(위조 usize 방어). */
export function zipEntryData(buf, e) { return inflateEntry(buf.subarray(e.start, e.start + e.csize), e); }

/** 파일에서 중앙 디렉터리만 읽어 항목 목록을 만든다(zip 을 메모리에 올리지 않는다).
 *  { fd, entries, close() } — 항목은 zipEntryDataFile(fd, e) 로 하나씩 해제하고, 끝나면 반드시 close(). 검사·상한은 zipIndex 와 같다. */
export function zipOpenFile(file, opts = {}) {
  const maxEntryBytes = opts.maxEntryBytes ?? MAX_ENTRY_BYTES, maxTotalBytes = opts.maxTotalBytes ?? MAX_TOTAL_BYTES, maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) throw new Error('not a zip (too short)');
    const tailLen = Math.min(65557, size), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
    const count = tail.readUInt16LE(eocd + 10);
    if (count > maxEntries) throw new Error('too many entries');
    const cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdSize > MAX_CD_BYTES) throw new Error('central directory too large');
    if (cdOff + cdSize > size) throw new Error('bad central directory (offset)');
    const cd = Buffer.alloc(cdSize); if (cdSize) fs.readSync(fd, cd, 0, cdSize, cdOff);
    const lh = Buffer.alloc(30);
    const out = []; let off = 0, total = 0;
    for (let i = 0; i < count; i++) {
      if (off + 46 > cd.length || cd.readUInt32LE(off) !== SIG_CENTRAL) throw new Error('bad central directory');
      const method = cd.readUInt16LE(off + 10);
      const csize = cd.readUInt32LE(off + 20), usize = cd.readUInt32LE(off + 24);
      const nlen = cd.readUInt16LE(off + 28), xlen = cd.readUInt16LE(off + 30), clen = cd.readUInt16LE(off + 32);
      const lho = cd.readUInt32LE(off + 42);
      if (off + 46 + nlen > cd.length) throw new Error('bad central directory (name length)');
      const name = cd.subarray(off + 46, off + 46 + nlen).toString('utf8');
      if (usize > maxEntryBytes) throw new Error(`entry too large: ${name} (${usize} bytes)`);
      total += usize; if (total > maxTotalBytes) throw new Error('zip too large (total)');
      if (lho + 30 > size) throw new Error(`bad local header: ${name}`);
      fs.readSync(fd, lh, 0, 30, lho);
      if (lh.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`bad local header: ${name}`);
      const localMethod = lh.readUInt16LE(8);
      if (opts.strictLocal && localMethod !== method) throw new Error(`local header method mismatch: ${name} (local ${localMethod}, central ${method})`);
      const start = lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (start + csize > size) throw new Error(`truncated entry: ${name}`);
      out.push({ name, method, localMethod, csize, usize, start });
      off += 46 + nlen + xlen + clen;
    }
    return { fd, entries: out, close: () => { try { fs.closeSync(fd); } catch {} } };
  } catch (e) { try { fs.closeSync(fd); } catch {} throw e; }
}

/** zipOpenFile 항목 하나를 파일에서 읽어 해제(그 항목 크기만큼만 메모리를 쓴다). */
export function zipEntryDataFile(fd, e) {
  const raw = Buffer.alloc(e.csize);
  if (e.csize) fs.readSync(fd, raw, 0, e.csize, e.start);
  return inflateEntry(raw, e);
}

/** zip 버퍼 → [{ name, data }] (폴더 항목 제외). 이름은 zip 안 표기 그대로(슬래시).
 *  opts: { maxEntryBytes, maxTotalBytes, maxEntries } — 압축해제 폭탄 방어(선언된 usize·실제 해제 결과 양쪽 다 상한 검사). */
export function zipRead(buf, opts = {}) {
  return zipIndex(buf, opts).filter(e => !e.name.endsWith('/')).map(e => ({ name: e.name, data: zipEntryData(buf, e) }));
}

/** [{ name, data, deflate?: true }] → zip 버퍼. 이름은 슬래시 구분, UTF-8 플래그(0x0800). deflate 미지정(false)=저장(0), true=deflate(8).
 *  ⚠ 로컬 헤더의 압축 방식(method)은 **오프셋 8**이다(10은 수정 시각). 2026-09-14 이전에는 10에 썼는데,
 *  우리 zipRead 는 중앙 디렉터리만 보므로 왕복은 됐지만 탐색기·7-Zip·bsdtar 는 항목 전부를 CRC 오류로 거절했다. */
export function zipWrite(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const { name, data, deflate } of entries) {
    const nb = Buffer.from(name, 'utf8'); const crc = zlib.crc32(data) >>> 0;
    const method = deflate ? 8 : 0;
    const payload = deflate ? zlib.deflateRawSync(data) : data;
    const csize = payload.length, usize = data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(SIG_LOCAL, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(csize, 18); lh.writeUInt32LE(usize, 22); lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(SIG_CENTRAL, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(csize, 20); ch.writeUInt32LE(usize, 24); ch.writeUInt16LE(nb.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, payload); centrals.push(ch, nb); off += 30 + nb.length + csize;
  }
  const cd = Buffer.concat(centrals);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(SIG_EOCD, 0); e.writeUInt16LE(0, 4); e.writeUInt16LE(0, 6); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16); e.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, e]);
}
