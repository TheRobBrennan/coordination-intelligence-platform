# Deploying the CIP demo to an Oracle Cloud VM

Goal: get the exact same stack that runs locally via `make up-tunnel` running
on a persistent Oracle Cloud VM instead of Rob's laptop, so the demo doesn't
depend on the laptop being on and connected. Same Cloudflare Tunnel hostnames
(`cip-preview-{web,auth,neo4j}.sploosh.ai`), same `.env`, same Docker images —
only the machine underneath changes.

This is deliberately the *shortest path*, not the final architecture. Revisit
after the August 20th CXC demo: proper CI-built images in GHCR, infra-as-code
for the VM, secrets manager instead of a copied `.env`, etc.

## Why this is simple

Cloudflare Tunnel is **outbound-only** — `cloudflared` on the VM opens a
connection *out* to Cloudflare's edge; nothing needs to be exposed to the
internet on any inbound port except SSH (22), which OCI opens by default.
There's no load balancer, no public IP configuration, no inbound firewall
rules to add for the app itself. Moving the tunnel from a laptop to a VM is
just "run the same containers somewhere else."

## 0. What's already done (this machine, tonight)

- [x] Confirmed `main` is up to date, ran `make clean` + a fresh `make up-web
      --build`, then the full `./scripts/preflight-check.sh --headed
      --no-pause` — all 6 stages passed (clean slate, local login, tunnel up,
      tunnel login, tunnel down, tunnel-gone, local login again). Stack is
      healthy and this exact `main` commit is proven working.
- [x] Wrote [`infra/oracle-cloud/cloud-init.yaml`](../../../infra/oracle-cloud/cloud-init.yaml)
      — creates a **non-root `cipdeploy` user** with passwordless sudo and
      only one SSH key (see below), installs Docker + git + make. The
      account/password OCI hands you for the box itself (root or `ubuntu`)
      is never used for anything after boot — treat it as sacred, per Rob's
      instruction, and don't SSH in as it day to day.

## 1. Generate a dedicated SSH keypair for this deploy

Don't reuse a key from another project — a compromised/leaked key for this
demo box should never be a way into anything else. This is a one-time step;
skip it if `~/.ssh/cip_oracle_deploy` already exists and you just need the
Console steps below.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/cip_oracle_deploy -N "" -C "cip-deploy-oracle-$(date +%Y%m%d)"
```

- `-f ~/.ssh/cip_oracle_deploy` — writes the private key there and the public
  key to `~/.ssh/cip_oracle_deploy.pub`. Change the filename if you're
  regenerating and want to keep the old pair around instead of overwriting it
  (e.g. `cip_oracle_deploy_2026.09` for a rotation).
- `-N ""` — no passphrase. This key only unlocks a short-lived demo box, and
  a passphrase would block the unattended `deploy-to-oracle.sh` script from
  using it non-interactively.
- `-C "..."` — just a label (shows up in `ssh-add -l` / the Console's key
  list), not functional. Doesn't need to match this exact format on a
  regenerate — just make it recognizable as "this is the CIP Oracle key."

The public key also lives in the repo for reference, since the Console step
below needs you to paste its contents:
[`infra/oracle-cloud/cip_oracle_deploy.pub`](../../../infra/oracle-cloud/cip_oracle_deploy.pub).
**The private key is never committed** — only `*.pub` files belong in git.
If you regenerate, copy the new `.pub` over that file (`cp
~/.ssh/cip_oracle_deploy.pub infra/oracle-cloud/cip_oracle_deploy.pub`) and
update the `ssh_authorized_keys` line in `cloud-init.yaml` to match — the two
must stay in sync, since `cloud-init.yaml` is what actually gets pasted into
new VMs going forward.

To reuse this same key on a brand new VM later (rebuild, second environment,
etc.), no regeneration needed — just paste the same `.pub` contents into that
VM's Console setup and cloud-init.

## 2. Create the VM (OCI Console — needs your login, can't be scripted from here)

1. Console → **Compute → Instances → Create Instance**.
2. Name: `cip-preview`.
3. **Image and shape**:
   - **Image**: defaults to **Oracle Linux 9** — click **Change image** and
     switch to **Ubuntu → Canonical Ubuntu 24.04**. Found by testing: if you
     select Ubuntu while the shape is still the default
     `VM.Standard.E2.1.Micro` (x86), the picker silently reverts back to
     Oracle Linux on confirm — OCI appears to filter/validate the image
     against the *currently selected* shape's architecture. Fix: set the
     shape to Ampere (arm64) **first**, then pick Ubuntu.
   - **Shape**: defaults to `VM.Standard.E2.1.Micro` (the *other* Always
     Free shape — AMD, 1 OCPU/1GB, not what we want). Click **Change shape**
     → **Ampere** tab → **VM.Standard.A1.Flex**. On the shape tile itself,
     click the expand arrow to reveal **Number of OCPUs** / **Amount of
     memory (GB)** fields (they're not visible until expanded).
   - The Always Free A1 allotment is up to **4 OCPU / 24GB total**, shared
     tenancy/region-wide (not per-instance) — set the shape to the full
     4/24 on the expanded **Number of OCPUs** / **Amount of memory (GB)**
     fields; it should show **Always Free-eligible** with no service-limit
     warning.
   - Found by testing (2026-08-17, night 1, still on the free-tier-only
     account): this tenancy's *actual* limit in `us-sanjose-1` was only
     **2 OCPU / 12GB total** at first — nowhere near the advertised 4/24. A
     `4`/`24` request threw a red "Service limits status: critical" banner,
     and even the region's one availability domain (AD-1) came back "Out of
     capacity for shape VM.Standard.A1.Flex" on launch. Upgrading the
     account to **Pay As You Go** (Billing & Cost Management → Upgrade and
     Manage Payment) cleared both problems — the full 4/24 became available
     and launches succeeded. Note the upgrade itself billed a real **$100
     charge** immediately (not a usage-based hold) — confirm you're fine
     with that before upgrading if you hit the same capacity wall.
   - If A1 capacity is still unavailable after upgrading, fall back to a
     paid **VM.Standard.E4.Flex** with 2 OCPU / 16GB — inexpensive, and this
     is a short-lived demo box.
4. **Networking**: use the default VCN/subnet OCI offers, "Assign a public
   IPv4 address" = **Yes**. Don't change the default security list — it
   already allows inbound SSH (22) from `0.0.0.0/0`, and nothing else needs
   to be opened (see "Why this is simple" above).
5. **Add SSH keys**: choose "Paste public keys" and paste the contents of
   `~/.ssh/cip_oracle_deploy.pub` (also at
   `infra/oracle-cloud/cip_oracle_deploy.pub` in this repo). This is
   redundant with the cloud-init user below, but OCI requires *a* key here
   for the default user regardless — harmless to also have it.
6. **Show Advanced Options → Management → Initialization script (cloud-init)**:
   paste the full contents of `infra/oracle-cloud/cloud-init.yaml` verbatim.
7. Create. Wait for the instance to reach **Running**, then copy its
   **public IP address**.

## 3. Connect to the VM

This VM's current public IP: **`163.192.26.57`** (`cip-preview`, created
2026-08-17). IPs are not static on this shape by default — if the instance
is ever stopped/started or recreated, get the new one from the Console
(Compute → Instances → cip-preview → Public IP address) and swap it in below.

```bash
ssh -i ~/.ssh/cip_oracle_deploy cipdeploy@163.192.26.57
```

Always connect as **`cipdeploy`**, never `opc`/`ubuntu`/root — that's the
whole point of the dedicated user. Useful spec-check commands once connected:

```bash
nproc          # OCPU count
free -h        # memory
df -h /        # disk
lscpu          # full CPU details (Ampere Altra)
uname -a       # kernel/arch (aarch64)
```

**Gotcha found by testing (2026-08-17, night 2):** the Console's
"Initialization script" field is easy to forget to paste on a given launch —
if you skip it, the instance boots with cloud-init reporting `status: done`
and **zero errors**, but none of `cloud-init.yaml`'s custom steps actually
ran (no `cipdeploy` user, no Docker). `cloud-init status --long` reporting
clean does *not* mean your custom script executed — always verify directly:

```bash
ssh -i ~/.ssh/cip_oracle_deploy opc@<IP> "getent passwd cipdeploy; which docker"
```

If that comes back empty, the script never applied. Rather than recreating
the instance, it's just as fast to run cloud-init's steps manually over SSH
as `opc` (which always exists and has sudo) — that's what happened on this
VM:

```bash
ssh -i ~/.ssh/cip_oracle_deploy opc@<IP> "sudo useradd -m -s /bin/bash cipdeploy \
  && sudo mkdir -p /home/cipdeploy/.ssh && sudo chmod 700 /home/cipdeploy/.ssh \
  && echo '<contents of cip_oracle_deploy.pub>' | sudo tee /home/cipdeploy/.ssh/authorized_keys \
  && sudo chmod 600 /home/cipdeploy/.ssh/authorized_keys \
  && sudo chown -R cipdeploy:cipdeploy /home/cipdeploy/.ssh \
  && echo 'cipdeploy ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/cipdeploy \
  && sudo chmod 440 /etc/sudoers.d/cipdeploy"

ssh -i ~/.ssh/cip_oracle_deploy cipdeploy@<IP> "sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo \
  && sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git make \
  && sudo systemctl enable --now docker \
  && sudo usermod -aG docker cipdeploy"
```

## 4. Ship the code + secrets to the VM

Handled by [`scripts/deploy/deploy-to-oracle.sh`](../../../scripts/deploy/deploy-to-oracle.sh)
once the IP is known — rsyncs the repo (excluding `node_modules`, `.git`,
build artifacts) and `.env` to `/home/cipdeploy/coordination-intelligence-platform`
on the VM over SSH. `.env` travels over the same SSH connection, never
committed, never logged.

```bash
./scripts/deploy/deploy-to-oracle.sh 163.192.26.57
```

## 5. Bring the stack up on the VM

**Use `docker compose ... up -d`, not `make up-tunnel` directly, over SSH.**
Found by testing: the Makefile's `up-tunnel` target runs `docker compose up
--build` *without* `-d` (attached/foreground) — fine when you're sitting at
the terminal, but fatal over SSH. If anything closes that SSH session's
stdin (the client disconnects, a wrapping script gets killed, even
indirectly), the attached `docker compose up` treats the lost terminal as a
shutdown signal and gracefully **stops every container in the project** —
looks like nothing happened, but `docker ps` comes back empty a few seconds
later. `nohup` alone does not protect against this (it only blocks SIGHUP,
not stdin closing).

```bash
ssh -i ~/.ssh/cip_oracle_deploy cipdeploy@163.192.26.57
cd coordination-intelligence-platform
make clean
docker compose -f infra/docker-compose.yml -f infra/docker-compose.tunnel.yml \
  --env-file .env --profile web --profile tunnel up -d --build
```

Same `TUNNEL_TOKEN` already in `.env` means the tunnel reconnects to the
*same* `cip-preview-*.sploosh.ai` hostnames — no DNS or Cloudflare dashboard
changes needed. (Only one tunnel client can hold that token's connection at a
time — stop `make up-tunnel` / `up-web` on the laptop before starting it on
the VM, so the two don't fight over the same hostnames.)

## 6. Verify

`./scripts/preflight-check.sh` is written for macOS — it calls `open -a
Safari`, which doesn't exist on Linux and will hard-fail the script
(`set -euo pipefail`) the moment it tries to open a browser. On the VM,
verify manually instead:

```bash
# public tunnel URLs
curl -sS -o /dev/null -w 'web: %{http_code}\n' https://cip-preview-web.sploosh.ai/
curl -sS -o /dev/null -w 'auth: %{http_code}\n' https://cip-preview-auth.sploosh.ai/realms/platform

# real login assertion via Playwright — needs Node/pnpm/Playwright installed
# on the HOST (not containerized), same as the Makefile's own test-web note.
# One-time setup on a fresh VM:
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
sudo corepack enable
cd apps/web && corepack prepare pnpm@11.8.0 --activate
pnpm install

# Playwright's own `--with-deps` flag runs `apt-get`, which doesn't exist on
# Oracle Linux (dnf-based) — found by testing: it aborts with "apt-get:
# command not found" before even downloading the browser binary, silently
# exiting 0 despite failing. Do the two halves separately instead:
pnpm exec playwright install chromium-headless-shell   # browser binary only
sudo dnf install -y nss nspr atk at-spi2-atk at-spi2-core cups-libs \
  libdrm libxkbcommon libXcomposite libXdamage libXfixes libXrandr \
  mesa-libgbm pango cairo alsa-lib libX11-xcb libxshmfence  # OS-level libs

# then, same as preflight-check.sh's verify_login():
PLAYWRIGHT_BASE_URL=https://cip-preview-web.sploosh.ai pnpm exec playwright test e2e/login.spec.ts
```

**Proven working** on `cip-preview` (2026-08-17): both `login.spec.ts` tests
passed against the live public URL — real sign-in via Keycloak, session
visible, sign-out confirmed. Not a page-load check; an actual login
assertion, on the real deployed instance.

Then do the manual smoke test from a browser on Rob's laptop against the
public `cip-preview-web.sploosh.ai` URL, since that's what Kathy/CXC will
actually see.

## 7. Longer-term (after August 20th, not tonight)

- Build/push images to GHCR from CI instead of `docker compose build` on the
  VM directly — faster redeploys, no build toolchain needed on the box.
- Move `.env` secrets to OCI Vault or GitHub Actions secrets instead of an
  scp'd file sitting on disk.
- Infra-as-code (Terraform) for the VM instead of clicking through the
  Console once.
- A systemd unit or `docker compose --profile web up -d --build` on boot, so
  the stack survives a VM reboot without a manual SSH session.
