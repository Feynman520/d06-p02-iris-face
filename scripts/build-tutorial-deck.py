# IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
"""튜토리얼 덱 변환기(v2.95, 2026-10-23 사용자 결정 = 연수 「교사를 위한 에이전트」 덱을 거의 그대로).

연수 덱 원본(R01 D06 P03 `_slide-builder/slides-src.html`)을 **읽기만** 하고 앱용 묶음을 `app/tutorial/deck/` 에 만든다.
  slides.html  — 쪽(section) 40장(원본 41장 − 40쪽 강사 소개). 쪽마다 data-no = 원본 쪽 번호
  deck.css     — 원본 <style> 을 그림자 DOM(shadow root) 안에서 쓰도록 바꾼 것(html·body·#stage 규칙 교체)
  deck-kr.woff2 — Noto Sans KR 을 덱에 쓰인 글자만 남긴 것(@font-face 는 tutorial.css — 그림자 DOM 안에서는 글꼴 선언이 안 먹는다)
  img/ asset/ logo/ qr/ video/ — 그림(WebP)·로고·QR·시연 영상
  manifest.json — 쪽 목록(번호·제목·영상 길이) + 원본 지문
공개 저장소(MIT)라 개인·학교 정보는 여기서 뺀다(EDITS · DROP) — 끝에서 금지 낱말 검사를 하고 하나라도 남으면 실패한다.
실행: python scripts/build-tutorial-deck.py [--src <P03 폴더>]   (기본 = 이 저장소에서 위로 올라가며 IRIS 영혼 폴더를 찾아 R01 덱)
"""
import sys, re, json, shutil, hashlib, argparse, importlib.util, subprocess, pathlib
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "app" / "tutorial" / "deck"
URL = "/app/tutorial/deck"  # 그림자 DOM 안의 상대 주소는 문서 기준이라 절대 주소로 쓴다
FONT = pathlib.Path(r"C:/Windows/Fonts/NotoSansKR-VF.ttf")
DROP = {40}  # 강사 소개(이름·학교·아바타·명함 QR) — 2026-10-23 사용자 결정
PH = ["정의", "지도", "소환", "3가지", "실습"]
# (쪽, 원문, 바꿀 글) — 원문은 그 쪽에 정확히 한 번 있어야 한다(없으면 원본이 바뀐 것이므로 멈춘다)
EDITS = [
    (1, '<div class="eyebrow">교사 연수 · 2026년 10월</div>', '<div class="eyebrow">IRIS 시작하기 · 약 18분</div>'),
    (2, '<div class="eyebrow">오늘의 흐름</div>', '<div class="eyebrow">이렇게 둘러봅니다</div>'),
    (2, '<p>일을 잘하게<br>하려면</p>', '<p>일을 잘하게 하려면<br>+ 내 폴더 만들기</p>'),
    (18, re.compile(r'(<li><b class="o">3</b><div>무료 · 오픈소스 )<small>[^<]*</small>'), r'\1<small>MIT 허가서</small>'),  # 제작자(학교·이름) 줄 — 원문 낱말을 공개 코드에 적지 않으려고 모양으로 찾는다
    (38, '<div class="eyebrow">시간이 남으면 · 직접 해 보기</div>', '<div class="eyebrow">직접 해 보기</div>'),
    (38, '<li><b>1</b><div>문 하나 설치 <small>처음이라면 ① 회사 앱</small></div></li>', '<li><b>1</b><div>IRIS 열기 <small>이미 끝났습니다</small></div></li>'),
]
CUT41 = re.compile(r'\s*<div class="fade d2" style="position:absolute;left:0;right:0;top:700px[^"]*">.*?감사합니다</div>\s*</div>', re.S)
BANNED_FILE = ROOT / "docs" / "공개금지낱말.txt"  # 개인·학교 낱말 목록은 공개 저장소에 두지 않는다(docs\ = 비공개)
BANNED = ["avatar", "QR:card"]


def find_p03():
    for d in [ROOT, *ROOT.parents]:
        hit = list(d.glob("R01-*/D06-*/P03-*/_slide-builder/slides-src.html"))
        if hit:
            return hit[0].parent.parent
    sys.exit("연수 덱(R01 D06 P03 _slide-builder/slides-src.html)을 찾지 못했습니다 — --src 로 P03 폴더를 주세요")


def webp(src, dst, width):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=82, method=6)


def duration(f):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True, timeout=30)
        return round(float(r.stdout.strip()))
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="P03-교사를 위한 에이전트 폴더")
    a = ap.parse_args()
    p03 = pathlib.Path(a.src) if a.src else find_p03()
    sb, slides_dir = p03 / "_slide-builder", p03 / "발표자료(Slides)"
    src_file = sb / "slides-src.html"
    raw = src_file.read_text(encoding="utf-8")

    # 연수 조립기의 표 함수(3×3 지도)를 그대로 빌린다 — 모듈 머리가 sys.argv 를 읽으므로 잠시 비운다
    spec = importlib.util.spec_from_file_location("deck_builder", sb / "build_slides.py")
    bs = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [sys.argv[0]]
    try:
        spec.loader.exec_module(bs)
    finally:
        sys.argv = argv

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # ---- CSS: 원본 <style> → 그림자 DOM 용 ----
    css = re.search(r"<style>(.*?)</style>", raw, re.S).group(1)
    css = re.sub(r"@font-face\{[^}]*\}", "", css, count=1)
    reps = [
        (r":root\{", ":host{"),
        (r"html,body\{[^}]*\}", ":host{display:block;position:relative;overflow:hidden;background:var(--white);font-family:'IRIS Deck KR','Malgun Gothic',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}"),
        (r"body\.blue\{[^}]*\}", ""),
        (r"#stage\{[^}]*\}", "#stage{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;overflow:hidden;background:var(--white)}"),
        (r"#bar\{[^}]*\}|#pno\{[^}]*\}|body\.blue #bar\{[^}]*\}|body\.blue #pno\{[^}]*\}", ""),
        (r"#help[^{]*\{[^}]*\}", ""),
    ]
    for pat, rep in reps:
        css, n = re.subn(pat, rep, css)
        if not n and not pat.startswith("#help") and "#bar" not in pat:
            sys.exit(f"CSS 규칙을 찾지 못했습니다: {pat}")
    if re.search(r"\b(html|body)\b", css):
        sys.exit("CSS 에 html/body 규칙이 남았습니다")
    css += "\n/* IRIS 튜토리얼 덧붙임: 영상은 누를 때만 재생 · 쪽 넘김 효과는 원본 그대로 */\n.vid{background:#0b0f1c}\n"
    (OUT / "deck.css").write_text(css.strip() + "\n", encoding="utf-8", newline="\n")

    # ---- 쪽 ----
    body = raw.replace("%%BUBBLES%%", "<i></i>" * 100)
    body = re.sub(r"%%M3(?::(\d))?%%", lambda m: bs.m3_table(int(m.group(1) or 0)), body)
    secs = re.findall(r'(<section class="slide[^"]*"[^>]*>)(.*?)</section>', body, re.S)
    if len(secs) != 41:
        sys.exit(f"원본 쪽 수가 41이 아닙니다({len(secs)}) — 변환기 EDITS·DROP 을 다시 확인하세요")
    secs = [[o, b] for o, b in secs]
    for no, old, new in EDITS:
        if isinstance(old, re.Pattern):
            secs[no - 1][1], c = old.subn(new, secs[no - 1][1])
        else:
            c = secs[no - 1][1].count(old)
            secs[no - 1][1] = secs[no - 1][1].replace(old, new)
        if c != 1:
            sys.exit(f"{no}쪽 고칠 곳을 찾지 못했습니다(일치 {c}회): {str(getattr(old, 'pattern', old))[:60]}")
    secs[40][1], n = CUT41.subn("", secs[40][1])
    if n != 1:
        sys.exit("41쪽 QR·인사 덩어리를 찾지 못했습니다")

    used, videos, missing = {}, {}, []

    def rep(m):
        kind, arg = m.group(1), m.group(2)
        if kind == "IMG":
            f = slides_dir / "그림" / f"{arg}.png"
            key = f"img/{arg.split('-')[0]}.webp"  # 주소는 영문·숫자만(원본 이름 앞 번호)
            if key not in used:
                if not f.exists():
                    missing.append(arg); return ""
                webp(f, OUT / key, 1400); used[key] = 1
            return f"{URL}/{key}"
        if kind in ("LOGO", "QR"):
            f = sb / "assets" / ("로고" if kind == "LOGO" else "QR") / f"{arg}.svg"
            key = f"{kind.lower()}/{arg}.svg"
            if key not in used:
                (OUT / key).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(f, OUT / key); used[key] = 1
            return f"{URL}/{key}"
        if kind == "ASSET":
            f = sb / "assets" / arg
            stem = pathlib.PurePosixPath(arg)
            key = f"asset/{stem.with_suffix('.webp') if stem.suffix.lower() in ('.png', '.jpg', '.jpeg') else stem}"
            if key not in used:
                (OUT / key).parent.mkdir(parents=True, exist_ok=True)
                if key.endswith(".webp"): webp(f, OUT / key, 1400)
                else: shutil.copyfile(f, OUT / key)
                used[key] = 1
            return f"{URL}/{key}"
        if kind == "VIDEO":
            name, _, label = arg.partition("|")
            name, _, start = name.partition("#t=")
            f = slides_dir / "영상" / f"{name}.mp4"
            if not f.exists():
                missing.append(name); return ""
            key = f"video/{name}.mp4"
            if key not in used:
                (OUT / key).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(f, OUT / key); used[key] = 1
                videos[name] = duration(f)
            return f'<video class="vid" src="{URL}/{key}{"#t=" + start if start else ""}" controls preload="metadata" playsinline title="{label}"></video>'
        return m.group(0)

    out_secs, manifest = [], []
    for i, (open_tag, inner) in enumerate(secs, 1):
        if i in DROP:
            continue
        inner = re.sub(r"\{\{(IMG|LOGO|QR|ASSET|VIDEO):([^}]+)\}\}", rep, inner)
        ph = int(re.search(r'data-phase="(-?\d)"', open_tag).group(1))
        if ph >= 0:  # 원본 발표 스크립트가 붙이던 단계 추적줄(머리띠의 개인 아바타는 붙이지 않는다)
            inner += '<div class="track">' + "<i></i>".join(f'<b class="{"done" if k < ph else "now" if k == ph else ""}">{p}</b>' for k, p in enumerate(PH)) + "</div>"
        vid = re.search(r'/video/([\w-]+)\.mp4', inner)
        title = re.sub(r"<[^>]+>", " ", (re.search(r"<h1[^>]*>(.*?)</h1>", inner, re.S) or re.search(r'class="eyebrow"[^>]*>(.*?)</div>', inner, re.S) or [None, ""])[1])
        title = re.sub(r"\s+", " ", title).strip()
        manifest.append({"no": i, "title": title, "phase": ph, **({"video": vid.group(1)} if vid else {})})
        out_secs.append(open_tag.replace("<section ", f'<section data-no="{i}" ', 1) + inner + "</section>")
    if missing:
        sys.exit(f"원본 자료가 없습니다: {missing}")
    html = "\n".join(out_secs)
    banned = BANNED + ([l.strip() for l in BANNED_FILE.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")] if BANNED_FILE.exists() else [])
    if not BANNED_FILE.exists():
        print(f"주의: {BANNED_FILE.name} 이 없어 개인·학교 낱말 검사는 기본 2개만 합니다")
    for w in banned:
        if w.lower() in html.lower():
            sys.exit(f"공개 금지 낱말이 남았습니다: {w}")
    (OUT / "slides.html").write_text(html + "\n", encoding="utf-8", newline="\n")

    # ---- 글꼴: 덱에 쓰인 글자만 ----
    from fontTools import subset
    chars = set(re.sub(r"(src|href)=\"[^\"]*\"", "", html)) | set(css) | set("0123456789 ·→←↓✔✕?!%()")
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]
    font = subset.load_font(str(FONT), opts)
    sub = subset.Subsetter(opts); sub.populate(text="".join(chars)); sub.subset(font)
    font.flavor = "woff2"; font.save(str(OUT / "deck-kr.woff2"))

    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    meta = {"source": "R01 D06 P03 _slide-builder/slides-src.html", "sourceSha256_16": digest, "dropped": sorted(DROP), "slides": manifest, "videoSeconds": videos}
    (OUT / "manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"ok 쪽 {len(out_secs)} · 파일 {sum(1 for f in OUT.rglob('*') if f.is_file())}개 · {total / 1e6:.1f}MB · 영상 {videos} · 원본 지문 {digest}")


if __name__ == "__main__":
    main()
