# Hermes Workspace

Hermes Workspace is a static web UI for a Hermes Dashboard. It has two safe modes:

- **Demo:** GitHub Pages renders generic example sessions and never contacts a Gateway.
- **Live self-hosting:** Docker serves the UI and reverse-proxies the browser's same-origin `/api`, `/auth`, and WebSocket routes to your own Hermes Dashboard.

No credentials, browser cookies, session transcripts, server names, or deployment paths are included in this repository.

## Try the demo

Enable GitHub Pages in the repository settings. The included workflow publishes a demo build from `main`.

## Install against your Hermes Dashboard

Requirements: Docker Compose and an already-running Hermes Dashboard that you control.

```bash
git clone https://github.com/YOUR_ACCOUNT/hermes-workspace-public.git
cd hermes-workspace-public
cp .env.example .env
# Edit .env with your own Dashboard values.
docker compose up --build -d
```

Open `http://localhost:8080`. Put the container behind your own HTTPS proxy before exposing it beyond your machine or private network.

### Required configuration

| Variable | Meaning |
| --- | --- |
| `HERMES_UPSTREAM` | Dashboard URL reachable from the container. |
| `HERMES_BACKEND_HOST` | Exact Host header accepted by that Dashboard. |
| `HERMES_BACKEND_ORIGIN` | Matching origin used only for the Gateway WebSocket handshake. |
| `NEXT_PUBLIC_HERMES_MODE` | Keep `live` for a real connection; use `demo` for example data only. |
| `NEXT_PUBLIC_BASE_PATH` | Optional subpath, such as `/workspace`. |

The Dashboard remains the authentication authority. Do not place dashboard tokens, cookies, API keys, or private endpoint URLs in frontend source or commit them to `.env`.

For OAuth-protected Dashboards, register the public HTTPS origin you deploy and use that same origin when starting the Dashboard. The reverse proxy deliberately keeps browser authentication same-origin and supports WebSocket upgrades without exposing credentials to JavaScript.

## Give this to an agent

> Clone this repository, copy `.env.example` to `.env`, set it to the Hermes Dashboard I control, run `docker compose up --build -d`, and verify that `http://localhost:8080` loads. Do not commit `.env` or copy Dashboard credentials into browser code.

## Development

```bash
npm ci
npm run build
```

Build a demo locally with `NEXT_PUBLIC_HERMES_MODE=demo`. For a GitHub Pages project site, also set `NEXT_PUBLIC_BASE_PATH` to the repository path.

## Before publishing

Choose and add a license that matches how you want others to reuse the code.
