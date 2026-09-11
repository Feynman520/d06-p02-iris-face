# IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
# IRIS-Face 음성 전사 워커 — faster-whisper 모델을 한 번 올려 두고 stdin(JSON 한 줄 = 요청 하나)으로 일한다. 데몬(voice.mjs)이 자식으로 띄운다.
# 요청  {"id","cmd":"load"|"transcribe", "model", "device":"auto"|"cuda"|"cpu", "file", "prompt"}
# 응답  {"id", "text","secs","device","model"} | {"id","error"} | {"event":"ready"|"loading"|"loaded", ...}
import sys, json, time, os, pathlib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
out = lambda obj: print(json.dumps(obj, ensure_ascii=False), flush=True)

# pip으로 넣은 CUDA 런타임(cuBLAS·cuDNN) DLL 폴더를 로더 경로에 올린다(있을 때만). 없으면 CPU로 후퇴한다.
_site = pathlib.Path(sys.executable).parent / "Lib" / "site-packages" / "nvidia"
for _sub in ("cublas", "cudnn"):
    _d = _site / _sub / "bin"
    if _d.exists():
        os.add_dll_directory(str(_d))
        os.environ["PATH"] = str(_d) + os.pathsep + os.environ.get("PATH", "")

try:
    from faster_whisper import WhisperModel
except Exception as e:  # 미설치·DLL 차단 등 — 데몬이 이 문구를 화면에 그대로 보여 준다
    out({"event": "fatal", "error": f"faster-whisper를 불러올 수 없습니다 — pip install faster-whisper nvidia-cublas-cu12 nvidia-cudnn-cu12 ({e})"})
    sys.exit(3)

models = {}      # 이름 → (모델, 실제 장치)

def load(name, device="auto"):
    if name in models:
        return models[name]
    t = time.time()
    out({"event": "loading", "model": name})
    m = None
    used = None
    if device in ("auto", "cuda"):
        try:
            m = WhisperModel(name, device="cuda", compute_type="float16")
            used = "cuda/float16"
        except Exception as e:
            out({"event": "log", "text": f"cuda 실패 → cpu로 후퇴: {str(e)[:200]}"})
    if m is None:
        m = WhisperModel(name, device="cpu", compute_type="int8")
        used = "cpu/int8"
    models[name] = (m, used)
    out({"event": "loaded", "model": name, "device": used, "secs": round(time.time() - t, 1)})
    return models[name]

out({"event": "ready", "pid": os.getpid()})
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = {}
    try:
        req = json.loads(line)
        name = req.get("model") or "large-v3-turbo"
        m, used = load(name, req.get("device") or "auto")
        if req.get("cmd") == "load":
            out({"id": req.get("id"), "ok": True, "device": used, "model": name})
            continue
        t = time.time()
        segs, info = m.transcribe(req["file"], language=req.get("language") or "ko", beam_size=5, vad_filter=True,
                                  initial_prompt=req.get("prompt") or None)
        text = " ".join(s.text.strip() for s in segs).strip()
        out({"id": req.get("id"), "text": text, "secs": round(time.time() - t, 2), "device": used, "model": name,
             "audio_secs": round(getattr(info, "duration", 0) or 0, 1)})
    except Exception as e:
        out({"id": req.get("id") if isinstance(req, dict) else None, "error": str(e)[:500]})
