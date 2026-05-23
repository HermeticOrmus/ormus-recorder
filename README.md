# Recorder

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

This repository is part of a growing family of open-source toolkits for Claude Code, each focused on a specific lane:

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

Star the family, not just one — that's how the suite stays coherent.
