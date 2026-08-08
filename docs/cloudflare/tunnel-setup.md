# Cloudflare Tunnel setup — for whoever holds the Cloudflare login

This guide assumes **only** that you can sign in to the Cloudflare account that
manages `sploosh.ai` — nothing about this codebase, Docker, or how the project
runs. If that's you, this is everything you need to do, start to finish.

If you're a developer running the project itself, you don't need this document
— see `docs/runbook.md`, "Preview (Cloudflare Tunnel)" instead. This guide
produces exactly one thing an engineer needs from you: **a token**, described
at the end.

## What you're setting up, in plain terms

Someone's laptop runs this project locally. A "tunnel" lets that laptop be
reached at a real web address — `cip-preview-web.sploosh.ai` — without opening
any ports, buying a server, or touching DNS by hand. Cloudflare's tunnel
software creates an outbound-only connection from the laptop to Cloudflare;
nothing needs to be exposed to the internet on the laptop's end.

You are creating that connection and handing the resulting **token** to the
engineer. You are not installing anything, and nothing here touches the
project's code.

## Before you start

- Access to the Cloudflare account that manages the `sploosh.ai` domain
- About 10 minutes
- No installs, no command line

This guide was written by walking through the actual dashboard on
2026-08-08, not from general Cloudflare knowledge — every screen and button
name below is what you'll actually see.

## Step 1 — Create the tunnel

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and sign in
2. In the left sidebar, under **Protect & connect**, click **Networking** to
   expand it, then click **Tunnels**
   - There is no separate "Zero Trust" dashboard for this — Tunnels lives
     directly under Networking on the main dashboard
   - If another tunnel already exists in the account, ignore it — you're
     creating a new one, not editing an existing one
3. Click **Create Tunnel** (top right)
4. Type the name: `cip-preview` — there's no separate "connector type" step,
   just the name
5. Click **Create Tunnel**

You'll land on a page with an OS picker (Windows / macOS / Debian / Red Hat /
Docker) and an install command. **You can ignore this whole page** — the
button to continue from here only activates once it detects a live
connection, which won't happen until an engineer actually starts the project.
Skip straight to Step 2.

## Step 2 — Get the token (this is the part to hand off)

1. From the tunnel's page, make sure you're on the **Overview** tab
2. Under "Install cloudflared connector," pick any OS option (**Docker** is
   the closest match to how this project actually runs it, but it doesn't
   matter — every option shows the same token)
3. You'll see a command like `docker run cloudflare/cloudflared:latest tunnel
   --no-autoupdate run --token <long string>`. Click the copy icon next to it.
4. **Ignore everything except the token.** You're not running this command —
   don't install Docker or cloudflared, don't run anything here.

Paste just the token into the project's `.env` file (or send it to your
engineer) as:

```
TUNNEL_TOKEN=<the string after --token>
```

**Treat this token like a password.** Anyone who has it can make this tunnel
point wherever they want. Send it the same way you'd send a password — not in
a public Slack channel, not in a GitHub issue or commit. The project's `.env`
file is already configured to never be committed to git (`.gitignore`
excludes it), so pasting it there directly is safe.

## Step 3 — Add the two public hostnames

Do this from the tunnel's own page — not the page from Step 1, which won't
let you proceed without a live connection.

1. Click the **Routes** tab (next to Overview)
2. Click **+ Add route**
3. Choose **Published application** (the one described as "Publish local
   applications to the Internet via public hostname" — **not** "Private
   hostname," which requires separate client software to reach)
4. Fill in:

   | Field | Value |
   |---|---|
   | Subdomain | `cip-preview-web` |
   | Domain | `sploosh.ai` — **check this dropdown carefully**; if the account manages more than one domain, it may default to the wrong one |
   | Path | leave blank |
   | Service URL | `http://web:3000` |

   Watch the "Full hostname" preview above the Path field — it should read
   `cip-preview-web.sploosh.ai` before you continue.
5. Click **Add route**. A confirmation panel shows the DNS record it created
   automatically — you don't need to touch DNS yourself. Click **Close**.
6. Click **+ Add route** again and repeat for the second hostname:

   | Field | Value |
   |---|---|
   | Subdomain | `cip-preview-auth` |
   | Domain | `sploosh.ai` |
   | Path | leave blank |
   | Service URL | `http://keycloak:8080` |

**Important — use `web:3000` and `keycloak:8080` as the Service URL, not
`localhost`.** These are the names of the project's own internal Docker
containers, and the tunnel connects to them from inside that same network —
`localhost` would point at the tunnel software itself, not the application.

## You're done

At this point:
- The tunnel exists, named `cip-preview`
- Two routes exist under its **Routes** tab: `cip-preview-web.sploosh.ai` →
  `http://web:3000` and `cip-preview-auth.sploosh.ai` → `http://keycloak:8080`
- You've handed off (or entered) the `TUNNEL_TOKEN`

The tunnel's **Overview** tab will show status **"Inactive"** until an
engineer actually starts the project with the token in place (`make
up-tunnel`) — that's expected, not an error on your part. Once they do, the
status changes and `https://cip-preview-web.sploosh.ai` will load the
application.

## If something needs to change later

- **Token compromised or shared with the wrong person:** on the tunnel's
  Overview tab, use **Rotate token** in the "Refresh token" panel on the
  right — this invalidates the old token immediately and issues a new one
  without touching the routes you already configured. Give the engineer the
  new token — they'll update `.env`. (Deleting and recreating the whole
  tunnel also works, but it throws away the routes too, so prefer rotating.)
- **Need a third hostname later** (e.g. exposing the API directly): repeat
  Step 3 with a new subdomain, pointing at the relevant container name and
  port. Ask the engineer what that should be — don't guess at the internal
  service name.
- **Tunnel shows "Inactive" and you weren't told to expect that:** the
  engineer's laptop isn't running the project right now, or their internet
  dropped. This isn't something you can fix from the dashboard — it needs to
  be running on their end.
