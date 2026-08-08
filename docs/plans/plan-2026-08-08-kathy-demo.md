# Demo plan — Kathy, Saturday August 8th

**Status:** active · **Written:** 2026-08-07 · **Demo:** Saturday 2026-08-08,
11:00am–1:30pm, in person. Kathy has a hard out at 2pm.

The single goal of this plan is a working demo tomorrow morning. Everything not
required for that is listed at the bottom under "After the demo" and is
deliberately out of scope until Kathy has seen something run.

## The one thing this demo has to do

From the June kickoff review, unchanged and still correct:

> Type a topic, instantly see which organizations across sectors are working on
> it — with the evidence to back it up.

If Kathy types a topic and sees real organizations with real source quotes pulled
from real websites, the demo succeeded. Nothing else is load-bearing.

## Where the project actually stands (audited 2026-08-07)

**Working:**

- Full containerized stack — Neo4j, Keycloak, Postgres, API, web — with hot reload
  (`make up` / `make up-web`)
- Keycloak auth end to end: sign in, session, sign out, RP-initiated logout
- FastAPI read API over the graph: `/health`, `/topics`, `/topics/{topic}/orgs`,
  `/orgs/{org}/topics`, behind a `Graph` protocol so tests inject a fake
- Ingestion components, each independently tested: `scraper.fetch_html`,
  `extractor.extract_topics`, `loader.load`, `preflight.check`, and five LLM
  adapters behind `get_adapter()` (anthropic, claude_cli, openai, mock, manual)
- 26-org seed list at `ingestion/seed/organizations.json`
- pytest suites for the API routes and the extractor (offline, fixture-based)

**Missing — and this is why there is nothing to demo today:**

| Gap | Impact |
|---|---|
| `ingestion/run.py` does not exist | Nothing has ever populated Neo4j. The graph is empty, so the API returns empty results. |
| `apps/web` has no product UI | `page.tsx` is a sign-in/sign-out screen. No topic search, no org list, no evidence view. |
| Playwright covers only auth | Both specs in `e2e/login.spec.ts` test Keycloak. Nothing asserts the product claim. |
| No Playwright reporter | No HTML report exists to share as evidence. |

The two gaps in the first two rows are the entire critical path. Everything else
can wait.

## What must be true by 11am

1. Neo4j holds real extracted data for a handful of real organizations
2. Typing a topic in the web UI returns those organizations, grouped by sector,
   each showing its confidence and the verbatim source quote
3. Keycloak sign-in still works — this is already true today, locally, with no
   tunnel involved. "Working auth" and "reachable at a public domain" are two
   separate wins; only the second needs tonight's step 0.
4. The whole thing is provably demoable via `make up-web` with **no internet
   dependency** — the meeting is in a restaurant, and `localhost` does not care
   about their wifi. This has to stay true *even if* step 0 succeeds — see the
   guardrail below.
5. *(Stretch, from step 0)* `cip-preview-web.sploosh.ai` resolves, has valid TLS,
   and signs in cleanly — a live domain to hand Kathy, in addition to the local
   demo, not instead of it.

## Guardrails

1. **No direct commits to `main`.** Date-prefixed branch and a PR (convention in
   commit `997c178`).
2. **Ingestion scales in a ladder, never all at once.** 1 org → 3 orgs → more,
   with a manual look at the graph between rungs. A scraper bug should cost one
   page fetch to find, not twenty-six.
3. **`mock` before real LLM calls.** `LLM_PROVIDER=mock` proves the wiring end to
   end at zero cost and zero network.
4. **Local demo is the fallback of record, always.** Step 0 must be additive —
   a compose override, never an edit to `infra/docker-compose.yml` or the shared
   `.env` — so `make up-web` with no override flag is provably localhost-safe at
   every point in the night, tunnel work in progress or not.
5. **Step 0 is time-boxed.** Budget ~60 minutes. If DNS, the tunnel, or the
   redirect-URI dance isn't clean by then, stop the `docker-compose.tunnel.yml`
   override (the base compose file was never touched, so this is just `docker
   compose --profile tunnel down`), confirm localhost still signs in, and move
   on to step 1. A live domain is worth having; it is not worth trading the
   actual demo content for.
6. **Write the guide as you build, verify it before moving on.** No "polish
   later" pass — later never comes, and a guide nobody has followed is a guess,
   not documentation. Each step below produces a real guide, and that guide gets
   proven by literally following it (a clean-state re-run of its own commands,
   or a fresh read as if you were the intended reader) before the step counts as
   done. See "Documentation as a deliverable" below.

## Documentation as a deliverable

Two audiences, kept separate rather than blended into one doc:

1. **A non-technical stakeholder landing on the GitHub URL cold** — Kathy, or
   someone at CXC she loops in. Needs to understand what this is and how to look
   at it, with zero assumed dev background. No `docker compose` flags, no env
   var names — a URL, a login, and what to type.
2. **Rebuild-from-scratch** — anyone on the team (or a future contractor) can
   stand up any piece — Keycloak, the tunnel, ingestion, the web app — from the
   docs alone. The test of a good guide here is literal: could someone follow it
   on a clean machine and get the same result, with no tribal knowledge filled
   in from memory.

This is a standing practice from here forward, not a one-time cleanup. Every
plan in `docs/plans/` carries doc updates as part of its own definition of done,
the same way tests are — written alongside the code, not bolted on after.
"Lightweight for now, polish it later" doesn't happen in practice — there is
never a later that isn't also the next urgent thing. The bar tonight is the real
bar: written *and* verified, for whatever gets newly built tonight.

- Step 0 → a real, followable guide in `docs/runbook.md` for the tunnel
  (audience 2) — proven by tearing the override down and bringing it back up
  from the doc alone before calling step 0 done
- Step 1 → `docs/runbook.md`'s ingestion section gets the real `run.py` CLI and
  the ladder, replacing the stale "(run.py = day 3-4)" placeholder (audience 2)
  — proven by running the documented commands verbatim, not from memory
- Step 2 → a polished, plain-language "what you're looking at" guide — audience
  1, and the thing that actually gets handed to Kathy tomorrow — proven by
  reading it cold, as if seeing the project for the first time
- Step 3 → the Playwright HTML report itself is the audience-2 artifact for this
  step; no separate writing needed, but confirm the report actually generates
  and opens before calling it done

What's still deferred to "After the demo" is narrower than before: **retroactively
documenting things that already worked before tonight** (the original Keycloak
setup, Neo4j, the full Docker stack from June) to the rebuild-from-scratch
standard. That's real, valuable work — it's just not "written as we build"
because tonight isn't building it. Everything actually touched tonight gets its
guide now.

**Deferred to "After the demo":** an audit pass over everything that *already*
works (Keycloak, Neo4j, the full Docker stack) to bring it up to the
rebuild-from-scratch standard. Most of that exists today only as tribal
knowledge from building it in June — worth doing properly, not worth rushing
into tonight's time box.

## Tonight's plan

### Step 0 — Cloudflare Tunnel, additive only (time-boxed, ~60 min)

Branch: `2026.08.08/cloudflare-tunnel-preview`

`sploosh.ai` is already on Cloudflare nameservers, so there is no nameserver
migration or propagation wait. `cloudflared` dials out from the MacBook to
Cloudflare's edge and publishes local ports at public hostnames with valid TLS —
no inbound ports, no public IP, no hosting cost.

| Hostname | → | Service |
|---|---|---|
| `cip-preview-web.sploosh.ai` | → | `localhost:3000` (Next.js) |
| `cip-preview-auth.sploosh.ai` | → | `localhost:8080` (Keycloak) |

**Corrected understanding (checked against the actual repo, not assumed):**
`infra/docker-compose.yml` never sets a fixed `KC_HOSTNAME` today, so Keycloak
already runs in a request-adaptive mode — it is not the coupling point. The real
coupling is two things in `apps/web/src/auth.ts`:

- `PUBLIC_ISSUER = process.env.KEYCLOAK_ISSUER` — one value for the whole running
  container, sent to every visitor's browser regardless of which hostname they
  used
- `post_logout_redirect_uri: "http://localhost:3000"` — a **literal string** in
  `signOut()`, not even an env var today

So do this as a strictly additive compose override, never an in-place edit of the
shared config:

- `infra/docker-compose.yml` (base) is **not modified**. `make up-web` stays the
  localhost-safe path unconditionally — no discipline required to keep it that
  way, nothing to remember to revert.
- New `infra/docker-compose.tunnel.yml` override: adds the `cloudflared` service,
  and overrides only the `web` service's `KEYCLOAK_ISSUER` and a new
  `POST_LOGOUT_REDIRECT_URI` env var to the tunnel-facing values.
- One small code change: `auth.ts`'s hardcoded `post_logout_redirect_uri` becomes
  `process.env.POST_LOGOUT_REDIRECT_URI ?? "http://localhost:3000"`.
- Realm `redirectUris` in `infra/keycloak/realm-export.json` gets
  `https://cip-preview-web.sploosh.ai/*` **added** alongside the existing
  `http://localhost:3000/*` and `https://*.vercel.app/*` entries — additive, not
  a swap. `webOrigins` already carries a `+` wildcard that mirrors whatever is in
  `redirectUris`, so CORS is covered for free. Change it live in the admin
  console for speed, then persist into `realm-export.json` in the PR —
  `--import-realm` only applies on a fresh volume.
- **While already in the realm config, turn on Keycloak's built-in Events**
  (realm → Events → enable "Save Events" + "Save Admin Events") — this logs
  logins, logouts, and admin actions with zero code, and it's the kind of
  explainability detail worth having on hand for the coffee conversation. This
  is a checkbox, not a workstream — if it doesn't take five minutes, skip it and
  move on; it does not extend the time box.
- Tunnel-on becomes an explicit extra flag, never a state to forget:
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.tunnel.yml --profile tunnel up -d`

**Why this is genuinely step 0 and not step 4:** because it is additive, there is
no destructive `make clean` involved and no data-loss ordering concern — it could
technically run after ingestion too. Doing it first is really about *risk*, not
data: it is the least-proven, most novel piece (first-time `cloudflared` setup,
DNS, redirect-URI correctness), so it deserves first crack at fresh attention
rather than being rushed at 1am. If it fails, nothing about steps 1–3 is
affected — the base compose file was never touched.

**Definition of done for this step:** with the override running, sign in via
`cip-preview-web.sploosh.ai` using an actual Keycloak account, land back on the
app authenticated, sign out — *and*, in a separate terminal, confirm
`make up-web` (no override) still signs in cleanly on `localhost:3000`. If both
don't hold within the time box, stop the override, confirm localhost still works
(it should, untouched), and move on to step 1. **Plus, written and verified
before this step counts as done:** a real guide in `docs/runbook.md` covering
the two commands (`make up-tunnel` / `down-tunnel`), the two hostnames, and what
to do if it breaks (base compose is untouched — just stop the override) —
proven by tearing the tunnel down and bringing it back up using only what the
guide says, not what's still in your head from building it.

## Tonight's critical path

### Step 1 — `ingestion/run.py`

Branch: `2026.08.08/ingestion-run-pipeline`

All three stages already exist with clean interfaces. This is orchestration, not
new architecture:

```
seed/organizations.json
  → scraper.fetch_html(url)
  → extractor.extract_topics(adapter, org_name=, source_url=, html=)
  → ExtractionResult(organization=, topics=, scraped_at=)
  → loader.load(driver, result)
```

**CLI shape** — the `--limit` / `--only` flags are what enforce guardrail 2:

| Flag | Purpose |
|---|---|
| `--seed PATH` | Seed file. Default `seed/organizations.json`. |
| `--limit N` | Process at most N orgs. **The ladder lives here.** |
| `--only NAME` | Process a single named org. Used for the first run. |
| `--dry-run` | Scrape and extract, print the result, write nothing to Neo4j. |

**Requirements:**

- Call `preflight.check()` before any work; exit non-zero if the provider is
  unusable — fail before spending a page fetch, not after
- `scraped_at` is stamped by `run.py` at call time, never inside pipeline code
  (`models.py` says so explicitly)
- One org failing must not abort the run. Seed orgs flagged `needs_validation`
  are expected to fail; log, count, continue
- Per-org progress line plus an end-of-run summary (processed / loaded / failed)
- pytest coverage with a fake adapter and fake driver — offline, matching the
  existing test style
- `docs/runbook.md`'s ingestion section rewritten with the real flags and the
  ladder below, replacing the stale "(run.py = day 3-4)" placeholder — verified
  by running the ladder's commands exactly as documented, copy-pasted, not from
  memory. The next person running this should not have to read the source to
  find `--limit`, and this step isn't done until that's actually true

**The ladder:**

1. `--only "Lumen Technologies" --dry-run` with `LLM_PROVIDER=mock` — proves
   scrape → extract without touching the database
2. Same without `--dry-run` — inspect the result in Neo4j Browser by hand
3. `--limit 3` — confirms multi-org iteration and error isolation
4. `--limit 3` with a real provider — first real extraction quality check
5. Only go wider once the above is clean. **The demo does not need 26 orgs** —
   it needs enough orgs across enough sectors to make cross-sector overlap
   visible. Five or six good ones beats twenty-six half-scraped ones.

### Step 2 — minimal topic search UI

Branch: `2026.08.08/topic-search-ui` · blocked by step 1

- Search page calling the existing API: type a topic → orgs grouped by sector,
  each with confidence and the verbatim `source_evidence` snippet
- Click through to an org → its topics
- **Build it as React Server Components** so Next.js calls FastAPI server-side.
  The API then never needs to be publicly reachable, which matters now that the
  tunnel from step 0 may already be live.
- Empty state and error state that do not look broken — Kathy will type something
  that returns nothing, and that moment should look deliberate
- A polished, plain-language guide (audience 1 — non-technical) covering: the
  URL, how to sign in, and two or three topics worth trying. This is the thing
  that actually gets handed to Kathy tomorrow, not a placeholder for one — keep
  it to a screen's worth, and verify it by reading it cold, as if seeing the
  project for the first time, before calling step 2 done

**Not tomorrow:** the force-directed graph view. The evidence-backed list is what
proves the claim; the graph is polish and can wait.

### Step 3 — the shareable spec

- A Playwright spec that walks the claim exactly as a stakeholder would read it:
  search a topic, assert orgs appear, assert evidence is shown
- `reporter: [["html"]]` in `playwright.config.ts` so a run produces an artifact
  that can be handed to Kathy and, later, to CXC stakeholders
- The existing Keycloak login specs keep passing — nothing in this plan touches
  auth
- No separate writing needed here — the HTML report itself is the audience-2
  deliverable for this step

## Not tomorrow

Explicitly out of scope, so they do not creep in at 1am:

- Keycloak account-lifecycle work — password reset, transactional email,
  verification, password policy
- Google SSO (tabled outright — see "After the demo")
- Enforcing auth on `apps/api`
- Application-level action auditing (what a signed-in user searches/clicks) —
  Keycloak's built-in login/session Events are the cheap in-scope version, see
  step 0
- Vercel, VMs, AuraDB, or any hosted deployment
- Force-directed graph visualization
- The full 26-org ingest
- PRD phases 2–4, People/Initiative/Event nodes, the "unconnected parallel
  efforts" discovery pass

## After the demo — the road to August 20th

The CXC call on Thursday August 20th is the one that plausibly needs a URL for
stakeholders who are not in the room. In rough order:

1. **Lean into Keycloak instead of bolting SSO onto it.** Google SSO is
   **tabled** — it only ever earned a place in the plan because the Vercel framing
   made Keycloak look like a liability to route around. With Keycloak staying as
   the token authority, the higher-value work is the account lifecycle it already
   provides, most of which is realm configuration rather than code:

   - SMTP configuration on the realm, so Keycloak can actually send mail
   - Forgot-password / password-reset flow (realm → Login → "Forgot password")
   - Email verification as a required action on registration
   - Password policy (length, complexity, reuse history) and brute-force
     detection (realm → Security defenses)
   - Self-service account console — already live at
     `/realms/platform/account`, currently unused by the demo
   - Custom email templates and login theming, when branding matters

   **Add a mail catcher to compose for this work.** A `mailpit` service means the
   whole email lifecycle is developable and Playwright-testable offline, with no
   SMTP provider, no sending domain, and no deliverability rabbit hole. Wire a
   real provider (Resend, Brevo, and SendGrid all have usable free tiers) only
   when mail needs to leave the machine — at which point `sploosh.ai` needs
   SPF/DKIM records for the sending subdomain.

   Persist every realm change into `realm-export.json`, remembering that
   `--import-realm` only applies on a fresh volume (`make clean && make up`).

   Google brokering stays available if it is ever actually wanted — Keycloak
   supports it as an upstream identity provider, and adding it later changes no
   application code.
2. **Enforce auth on `apps/api`.** It currently enforces none — see the module
   docstring in `app/main.py`, which marks the intended seam. Add a verify-JWT
   dependency there (realm JWKS, check signature/issuer/audience/expiry, require
   the `analyst` role). Routes do not change.
3. **Application-level action auditing.** Keycloak's built-in Events (turned on
   in step 0) covers login/logout/admin actions for free, but nothing today logs
   what a signed-in user actually *does* — which topics they search, which orgs
   they open. There's no audit store or instrumentation for this yet; it's real
   feature work, not a config toggle. Natural to build once auth is enforced on
   `apps/api` (item 2) — the same seam that identifies the caller is what an
   audit log would key off of.
4. **Decide how the preview is served** — the Cloudflare Tunnel above may simply
   be the answer, in which case there is no hosting to buy. If an always-on host
   is wanted, the whole stack is one `docker-compose.yml` and runs on any single
   VM; a four-provider split is not required and is more work, not less.
5. **Widen the ingest** to the full seed list once extraction quality is proven.
6. **Graph visualization** and the "unconnected parallel efforts" pass, if time
   allows — these are the stretch items from the June kickoff.
7. **Rebuild-from-scratch documentation audit** — bring everything that already
   works (Keycloak setup, Neo4j, the full Docker stack) up to the standard set
   in "Documentation as a deliverable" above. This exists today mostly as tribal
   knowledge from building it in June; worth doing properly as its own pass
   rather than folded into feature work.

## Open questions for Kathy (tomorrow)

Carried from the June kickoff, still unanswered:

1. Is the ~25-org seed list the right demo dataset, or is there a sharper
   must-impress subset?
2. Is OpenAI/Azure a hard requirement (Azure credits, compliance), or is the
   provider ours to pick?
3. Do stakeholders need to reach the demo themselves before the August 20th call,
   or is a screen-share sufficient? — determines whether the tunnel above is worth
   finishing
4. Is anything non-public expected in the ingest? (PRD §9.3 says public sources
   only.)
5. What does "done" mean for the $1,200 — is the PoC the deliverable, or a
   stepping stone to a Phase 1 engagement?
