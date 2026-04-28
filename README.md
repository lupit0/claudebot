# Seneca Voice

Private browser voice interface for Seneca/OpenClaw.

## What it does

- Serves a mobile-friendly web page under `/seneca-voice/`.
- Uses the browser microphone via Web Speech recognition.
- Sends transcribed text to OpenClaw with a stable private session id.
- Speaks replies back using browser speech synthesis.
- Requires a private bearer token / one-time URL token.

This MVP avoids Twilio/SIM providers. The user's browser supplies the microphone and speaker; the VPS only hosts the web UI and OpenClaw bridge.

## Run locally

```bash
npm install
cp .env.example .env
# edit .env
npm start
```

## Required env

```bash
PORT=8794
BASE_PATH=/seneca-voice
SENECA_VOICE_TOKEN=<long-random-token>
OPENCLAW_AGENT_ID=main
SESSION_PREFIX=seneca-voice
```

## Deployed here

- URL path: `https://botcookies.breogancapital.co.uk/seneca-voice/`
- systemd unit: `seneca-voice.service`
- nginx site: `/etc/nginx/sites-available/cookie-relay`
