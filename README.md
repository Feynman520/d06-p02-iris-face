# IRIS-Face

**한국어: [README.ko.md](README.ko.md)**

A desktop desk for **Claude Code** and **Codex** sessions on Windows. One window, many sessions: pick a folder, pick the agent, model and thinking depth exactly as you would in a terminal, then type. IRIS-Face launches the **unmodified CLI** in a hidden virtual terminal, reads the session's own transcript file, and renders it as a clean conversation — with inline previews, sub-agent chips and completion notices.

It never touches your CLI configuration, subscriptions, or instruction files. Delete the folder and it is gone.

![IRIS-Face home](docs/readme-home.png)

## What it does

```text
① choose   — folder · Claude/Codex · model · thinking depth · (permission mode)   → Enter
      ↓
② launch   — the daemon starts the real CLI in that folder inside a ConPTY (node-pty + xterm headless)
      ↓
③ render   — the CLI's transcript file (.jsonl) is tailed and drawn as turns: request → steps → answer
      ↓
④ continue — reply in the same session, or switch model/depth (resume) or even Claude↔Codex (context handoff)
      ↓
⑤ keep     — sessions survive closing the window; the tray ⏻ ends everything at once
```

| Piece | What it is |
|---|---|
| `daemon/` | Pure Node HTTP + WebSocket server on `127.0.0.1:3458`. Owns the virtual terminals, tails transcripts, serves the page. |
| `app/` | The page (vanilla JS/CSS, no framework). Star sphere stage, task list, composer, settings, previews. |
| `app/electron/` | Electron window + tray. Optional: `node launch.mjs --browser` opens the page in your browser instead. |
| `state/` | Runtime state (sessions, logs, caches, settings). Git-ignored. |
| `scripts/` | Regression checks (`npm run verify:*`). |

## Features

- **Many sessions, one window** — task list on the left (Ctrl+1…9 to jump), each session keeps its own folder, agent and combination.
- **Terminal-faithful choice** — agent, model, thinking depth and permission mode are passed as CLI flags only; your `settings.json` / `config.toml` are never edited.
- **Switch mid-conversation** — same agent: `--resume` / `codex resume`; different agent: the last turns are handed over as the first request of the new CLI.
- **Inline previews** — images, HTML, PDF, localhost URLs, and (optional) Hangul/Office documents converted to PDF appear inside the conversation; ⧉ opens the original.
- **Sub-agent chips** — background/sub agents show as chips (status, model, tool count, elapsed); click one for a read-only drawer of its transcript.
- **Done notices** — a small toast (and an OS notification when the window is behind you) when a request finishes.
- **Raw terminal** — Ctrl+T flips any session to the real terminal view; Esc interrupts.
- **Voice input** (optional) — 🎤 / Ctrl+M records, a local faster-whisper worker transcribes, the text lands at the cursor. Nothing leaves your PC.
- **Looks** — header mark ×21, fonts, 9 themes, star-sphere / other stage animations, all in ⚙ settings.
- **Signature** — Ctrl+Alt+I draws the maker's signature in the stars.

## Requirements

| Needed | Notes |
|---|---|
| Windows 10/11 | ConPTY via node-pty. |
| Node.js ≥ 22 (24 tested) | `npm install` builds `node-pty` and downloads Electron. |
| Claude Code CLI and/or Codex CLI | Installed and logged in. IRIS-Face only launches what is on your PATH. |

Optional (auto-detected; the feature simply stays off when missing):

| Feature | What enables it |
|---|---|
| 🎤 Voice input | Python 3 + `pip install faster-whisper` (CUDA if available). Set `IRIS_FACE_PYTHON` if Python is not on PATH. |
| Hangul / Office → PDF preview | Python with `pywin32` (Office) and a `pyhwpx` venv (Hangul). `IRIS_FACE_PY`, `IRIS_FACE_HWP_PY`. |
| Usage batteries + Ctrl+D dashboard | The TeamClaude dashboard tool. `TEAMCLAUDE_DASH_DIR`, `TEAMCLAUDE_DASH_PORT`. Without it the header battery and the drawer are hidden. |
| Folder picker tree | An IRIS workspace (`_ontology/graph.json`). Otherwise you type/paste a folder path. |

## Install

```
git clone https://github.com/Feynman520/d06-p02-iris-face
cd d06-p02-iris-face
npm install
node launch.mjs            # starts the daemon if needed, opens the Electron window
```

- `node launch.mjs --browser` — open in the default browser instead of Electron.
- `node launch.mjs --no-open` — daemon only (`http://127.0.0.1:3458/`).
- `wscript.exe //nologo launch-hidden.vbs [same flags]` — the same launcher with **no console window** (what a desktop shortcut should point at). Launcher output goes to `state/launch.log`; a fatal failure shows a message box. Set `IRIS_FACE_NODE` if `node` is not on PATH.
- Quit everything: tray icon → ⏻, or ⚙ settings → 전부 종료. Closing the window only hides it; sessions keep running.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `IRIS_FACE_PORT` | `3458` | Daemon port (a second daemon for testing: `IRIS_FACE_PORT=3459 IRIS_FACE_STATE=<dir>`). |
| `IRIS_FACE_STATE` | `./state` | Runtime state folder. |
| `IRIS_ROOT` | auto (nearest folder with `_agent/` or `_ontology/graph.json`) | Workspace root shown in the header and used by the folder picker. |
| `IRIS_FACE_PYTHON` | auto (`%LOCALAPPDATA%\Programs\Python`, then PATH) | Python for voice input. |
| `IRIS_FACE_PY` / `IRIS_FACE_HWP_PY` | `python` / auto | Python for Office / Hangul document conversion. |
| `TEAMCLAUDE_DASH_DIR` / `TEAMCLAUDE_DASH_PORT` | auto / `3457` | TeamClaude dashboard tool location and viewer port. |
| `CLAUDE_CONFIG_DIR` | `<root>/_agent/claude` | Where Claude Code keeps its config (passed through). |
| `IRIS_FACE_ENTER_QUIET_MS` / `IRIS_FACE_ENTER_MAX_WAIT_MS` | `300` / `3000` | Paste-then-Enter timing for the CLI input line (see `daemon/sessions.mjs`). |

## Keyboard

| Key | Action |
|---|---|
| Enter / Ctrl+Enter | send / newline |
| ↑ ↓ | input history |
| Ctrl+N · Ctrl+O | new session · folder picker |
| Ctrl+1…9 | jump to session |
| Ctrl+T | terminal view |
| Ctrl+M | voice input |
| Ctrl+D | usage dashboard (when available) |
| Ctrl+, | settings |
| Esc | interrupt the running request / close drawer |

## Design notes

- **Untouched principle** — the CLI, its config and your instruction files are read-only to IRIS-Face. Everything session-specific lives in `state/` or is passed as a launch flag.
- **One way into the CLI** — text reaches the CLI only through `sessions.mjs send()`: paste, wait until the screen is quiet, Enter, verify, retry. `state/daemon.log` records `send` / `enter ok` / `enter retry` / `enter FAILED`.
- **No native dialogs** — the page uses its own `Dialog` because a native `alert()` makes an Electron window on Windows lose keyboard focus.
- Design documents: [docs/설계.md](docs/설계.md), [docs/디자인.md](docs/디자인.md) (Korean).

## Uninstall

Quit with ⏻, then delete the folder. Nothing is written elsewhere.

## License

MIT — © 2026 Sejun Ham. "해결은 에이전트가, 정의는 우리가." (Agents solve; we define.)
