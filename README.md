<p align="center">
  <img src="https://ormus.solutions/mascot/pixellab_liquid_to_tags.gif" alt="Recorder" width="128" style="image-rendering: pixelated;" />
</p>

<h1 align="center">Recorder</h1>

<p align="center">
  <em>Voice recorder PWA with local Whisper transcription</em>
</p>

<p align="center">
  <a href="https://github.com/HermeticOrmus/ormus-recorder/stargazers"><img src="https://img.shields.io/github/stars/HermeticOrmus/ormus-recorder?style=flat-square&color=aa8142" alt="Stars" /></a>
  <a href="https://github.com/HermeticOrmus/ormus-recorder/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HermeticOrmus/ormus-recorder?style=flat-square&color=aa8142" alt="License" /></a>
  <a href="https://github.com/HermeticOrmus/ormus-recorder/commits"><img src="https://img.shields.io/github/last-commit/HermeticOrmus/ormus-recorder?style=flat-square&color=aa8142" alt="Last Commit" /></a>
  <img src="https://img.shields.io/badge/Claude_Code-aa8142?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code" />
</p>

---
Voice recorder PWA with local Whisper transcription. Record voice messages or quick notes from your phone, transcribe them locally with Whisper, and optionally relay them to other machines via SSH.

## Features

- **PWA** -- installable on mobile, works offline for recording
- **Two modes** -- Voice Message (auto-send on stop) and Quick Note (with live speech-to-text preview)
- **Local Whisper transcription** -- runs on your own hardware, no cloud APIs needed
- **Transcript cleanup** -- optional Claude API integration to clean up raw Whisper output
- **Multi-user** -- Cloudflare Access identity mapping (optional)
- **SSH relay** -- send recordings to other machines via SCP
- **Auto-cleanup** -- prune old audio files after transcription (keeps transcripts)
- **Notes organizer** -- auto-organize quick notes into Obsidian-compatible markdown

## Setup

```bash
git clone https://github.com/HermeticOrmus/ormus-recorder.git
cd ormus-recorder
npm install
cp .env.example .env
# Edit .env with your Whisper path and preferences
npm start
```

Open `http://localhost:8082` on your phone (same network) or set up a reverse proxy.

## Whisper

Install one of:

- [openai-whisper](https://github.com/openai/whisper): `pip install openai-whisper`
- [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) (Apple Silicon): `pip install mlx-whisper`

Set `WHISPER_BIN` in `.env` to the binary path.

## Cloudflare Access (optional)

If you put this behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/), the server reads the `cf-access-authenticated-user-email` header to identify users. Map emails to names with the `EMAIL_MAP` env var.

## Logo

Place a `logo.png` in `static/` for the PWA icon. Any square PNG works.

## License

MIT

---

## Part of the Libre Open-Source Stack for Claude Code

This repository is part of a growing family of open-source toolkits for Claude Code.

### Libre suite — comprehensive plugin bundles

- [LibreUIUX-Claude-Code](https://github.com/HermeticOrmus/LibreUIUX-Claude-Code) — UI/UX development (152 agents, 70 plugins, 76 commands, 74 skills)
- [LibreArch-Claude-Code](https://github.com/HermeticOrmus/LibreArch-Claude-Code) — Software architecture and system design
- [LibreCopy-Claude-Code](https://github.com/HermeticOrmus/LibreCopy-Claude-Code) — Technical writing and documentation engineering
- [LibreDevOps-Claude-Code](https://github.com/HermeticOrmus/LibreDevOps-Claude-Code) — DevOps engineering and infrastructure automation
- [LibreEmbed-Claude-Code](https://github.com/HermeticOrmus/LibreEmbed-Claude-Code) — Embedded systems, firmware, and IoT development
- [LibreFinTech-Claude-Code](https://github.com/HermeticOrmus/LibreFinTech-Claude-Code) — Financial technology development
- [LibreGEO-Claude-Code](https://github.com/HermeticOrmus/LibreGEO-Claude-Code) — AI-search optimization (ChatGPT, Perplexity, Gemini, Google AI Overviews)
- [LibreGameDev-Claude-Code](https://github.com/HermeticOrmus/LibreGameDev-Claude-Code) — Game development across Godot, Unity, Unreal
- [LibreMLOps-Claude-Code](https://github.com/HermeticOrmus/LibreMLOps-Claude-Code) — ML engineering and AI operations
- [LibreMobileDev-Claude-Code](https://github.com/HermeticOrmus/LibreMobileDev-Claude-Code) — Mobile app development (Flutter, React Native, native iOS, native Android)
- [LibreSecOps-Claude-Code](https://github.com/HermeticOrmus/LibreSecOps-Claude-Code) — Security operations

### Skills mini-repos — single CLAUDE.md drop-ins

- [vibe-engineer-skills](https://github.com/HermeticOrmus/vibe-engineer-skills) — Direct AI codegen well (hypothesis → scope → validate → reject working-but-wrong)
- [markdown-discipline-skills](https://github.com/HermeticOrmus/markdown-discipline-skills) — Strip AI-slop from markdown (no em dashes, no marketing fluff)
- [shell-safety-skills](https://github.com/HermeticOrmus/shell-safety-skills) — `set -euo pipefail` discipline + 15 failure-mode examples
- [commit-standard-skills](https://github.com/HermeticOrmus/commit-standard-skills) — Ormus Commit Standard v1.0 + commit-msg hook + commitlint
- [unwoke-skills](https://github.com/HermeticOrmus/unwoke-skills) — Strip AI theater (ten sins to eliminate, symmetric engagement)
- [python-conventions-skills](https://github.com/HermeticOrmus/python-conventions-skills) — Modern Python 3.11+ (types, pathlib, async, ruff, mypy, uv)
- [typescript-conventions-skills](https://github.com/HermeticOrmus/typescript-conventions-skills) — TypeScript strict mode, discriminated unions, Result types
- [hermetic-laws-skills](https://github.com/HermeticOrmus/hermetic-laws-skills) — Seven Hermetic Principles applied to engineering
- [riper-workflow-skills](https://github.com/HermeticOrmus/riper-workflow-skills) — Research / Innovate / Plan / Execute / Review systematic dev
- [six-day-cycle-skills](https://github.com/HermeticOrmus/six-day-cycle-skills) — Sustainable shipping cadence with mandatory rest
- [token-optimization-skills](https://github.com/HermeticOrmus/token-optimization-skills) — Claude Code token + context optimization
- [osint-skills](https://github.com/HermeticOrmus/osint-skills) — OSINT research methodology (multi-wave investigative spiral)
- [calcinate-skills](https://github.com/HermeticOrmus/calcinate-skills) — Stage 1 of the Magnum Opus (burn project bloat)
- [claude-md-overhaul-skills](https://github.com/HermeticOrmus/claude-md-overhaul-skills) — Audit CLAUDE.md and MEMORY.md against caps
- [session-handoff-skills](https://github.com/HermeticOrmus/session-handoff-skills) — Session handoff + pickup discipline
- [naming-skills](https://github.com/HermeticOrmus/naming-skills) — Product naming methodology (mine the brand's vocabulary)
- [magnum-opus-skills](https://github.com/HermeticOrmus/magnum-opus-skills) — Seven-stage alchemy applied to project transformation

### Template source

- [andrej-karpathy-skills](https://github.com/HermeticOrmus/andrej-karpathy-skills) — the canonical single-file CLAUDE.md pattern (fork of jiayuan_jy's original)

Star the family, not just one — that's how the suite stays coherent.
