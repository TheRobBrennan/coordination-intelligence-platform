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

## Step 1 — Create the tunnel

1. Go to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. In the left sidebar: **Networks → Tunnels**
3. Click **Create a tunnel**
4. Choose connector type: **Cloudflared**
5. Name it: `cip-preview`
6. Click **Save tunnel**

## Step 2 — Get the token (this is the part to hand off)

You'll land on an "Install and run connector" screen showing install commands
for various operating systems. **Ignore all of it** — you're not installing
anything. Every one of those commands contains `--token` followed by a long
string of letters and numbers. That string is the only thing you need from this
screen.

Copy just that token string and send it to your engineer, or paste it directly
into the project's `.env` file yourself as:

```
TUNNEL_TOKEN=<the string you copied>
```

**Treat this token like a password.** Anyone who has it can make this tunnel
point wherever they want. Send it the same way you'd send a password — not in
a public Slack channel, not in a GitHub issue or commit. The project's `.env`
file is already configured to never be committed to git (`.gitignore` excludes
it), so pasting it there directly is safe.

Click **Next** once you've copied it.

## Step 3 — Add the two public hostnames

You'll now see a "Route traffic" screen asking for public hostnames. Add these
two, exactly as written:

| Subdomain | Domain | Path | Service type | URL |
|---|---|---|---|---|
| `cip-preview-web` | `sploosh.ai` | *(leave blank)* | `HTTP` | `web:3000` |
| `cip-preview-auth` | `sploosh.ai` | *(leave blank)* | `HTTP` | `keycloak:8080` |

Add the first one, then click **+ Add a public hostname** for the second.

**Important — use `web:3000` and `keycloak:8080` as the URL, not
`localhost:3000` or an IP address.** These are the names of the project's own
internal Docker containers, and the tunnel connects to them from inside that
same network — `localhost` would point at the tunnel software itself, not the
application.

Click **Save tunnel** (or **Complete setup**, depending on what the dashboard
shows) to finish.

You do not need to touch DNS yourself — `sploosh.ai` is already managed by
Cloudflare, and creating the public hostnames above creates the matching DNS
records automatically.

## You're done

At this point:
- The tunnel exists and is named `cip-preview`
- Two public hostnames route to it: `cip-preview-web.sploosh.ai` and
  `cip-preview-auth.sploosh.ai`
- You've handed off (or entered) the `TUNNEL_TOKEN`

The tunnel will show as **"Down"** or **"Inactive"** in the dashboard until an
engineer actually starts the project with the token in place (`make
up-tunnel`) — that's expected, not an error on your part. Once they do, the
status changes to **"Healthy"** and `https://cip-preview-web.sploosh.ai` will
load the application.

## If something needs to change later

- **Token compromised or shared with the wrong person:** delete the tunnel
  (**Networks → Tunnels → cip-preview → ⋮ → Delete**) and create a new one from
  Step 1. The old token stops working immediately. Give the engineer the new
  token — they'll update `.env`.
- **Need a third hostname later** (e.g. exposing the API directly): repeat
  Step 3 with a new subdomain, pointing at the relevant container name and
  port. Ask the engineer what that should be — don't guess at the internal
  service name.
- **Tunnel shows "Down" and you weren't told to expect that:** the engineer's
  laptop isn't running the project right now, or their internet dropped. This
  isn't something you can fix from the dashboard — it needs to be running on
  their end.
