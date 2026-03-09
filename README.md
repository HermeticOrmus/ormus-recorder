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
