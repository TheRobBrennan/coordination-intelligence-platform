# Demo plan — Robert Renzulli, Thursday August 13th

**Status:** demo delivered, went well · **Written:** 2026-08-13, ~10:40am ·
**Verified:** ~10:51am, then again via `preflight-check.sh --headed` ~10:56am
· **Demo:** 11:00am–12:21pm, earlier than either window Robert offered
(today after 13:00 / tomorrow after 10am Pacific) — actual time ended up
outside both, confirmed directly rather than over email.

## Morning-of cheat sheet — read this part, not the rest, at the table

**Stack is already up and verified as of 10:51am.** If it's still running,
you don't need to do anything before Robert joins — just open
`http://localhost:3000`, sign in as `demo-analyst` / `demo`, and go.

If you need to restart it (crash, reboot, or want a fresh clean slate
again):

```bash
cd /Users/rob/repos/kathy-green/coordination-intelligence-platform
make clean      # wipes volumes/images — full fresh slate
make up-web     # rebuilds and starts Neo4j, Keycloak, API, web
```

Wait for `cip-web | ✓ Ready in ...` in the terminal, then in the browser:

1. Go to `http://localhost:3000` → sign in as `demo-analyst` / `demo`.
2. The graph starts **empty** on a clean volume — that's expected, not
   broken. Go to `http://localhost:3000/pipeline` ("Behind the scenes")
   and click **"Reset to clean demo set"**. This loads 6 cached orgs
   instantly (Lumen, Verizon, NextEra Energy, Zscaler, Deloitte,
   Health-ISAC) — no live internet scrape, so it's wifi-proof at the table.
3. Back on `/`, search a topic — e.g. **"threat intelligence"** or
   **"cybersecurity"** — and confirm orgs + confidence % + verbatim
   evidence quotes render, grouped by sector.

**CyberGeist Security's URL was not added before the call.** It's still
flagged "No URL on file — can't be scraped yet" on `/pipeline`, unchanged
from this morning's read. Worth doing before the *next* time this app is
shown to someone from CyberGeist — Robert doesn't have a public company
URL on file that we found during today's LinkedIn research either, so
confirming the right one with him directly (rather than guessing at a
domain) is the actual next step here, not just a pipeline run.

Builds on [`docs/plans/2026.08.08/kathy-demo.md`](../2026.08.08/kathy-demo.md)
(the plan for the demo Kathy already saw on Saturday 8/8) — that doc is
historical record of what was built for and shown at that demo and is not
being edited. This is a fresh plan for showing the same app to a new
stakeholder, five days later, on a codebase that's moved on since.

## Context

Per Kathy's 2026-08-12 email thread ("Demo for Robert"): she's still excited
about what was shown 8/8 and wants Robert and Rob to coordinate directly on
a walkthrough. Her framing — this first pass is "our community building
contribution of visual, open-source directory of the orgs and the
capabilities they provide," presentable to CXC, with other ideas discussed
scoped as a longer-term project independent of the CXC offering. She meets
CXC next on **August 20th**, so having this demo-ready for Robert now is
what's actually load-bearing today.

Robert replied same day: "We got this, Kathy" — offered today after 13:00
or tomorrow after 10am Pacific, call on Teams or Zoom, waiting to hear back.

**Who Robert is** (background captured 2026-08-13, from LinkedIn —
`linkedin.com/in/rrenzulli`, already 1st-degree connected, Kathy is a
mutual connection):

- Founder & Operational Intelligence Strategist, **CyberGeist Security
  LLC** — San Diego, small shop (2-10 employees, founded 2020). Also CISO,
  Board Member, Speaker, U.S. Army veteran (Army Intelligence School, Fort
  Devens — Electronic Warfare/Intelligence; time at MIT).
- Deep fintech/payments/telecom/mobile/cloud security background: built
  CIBER's first formal security practice through its Savvis acquisition;
  stood up Managed Security Services at CenturyLink; security design on
  MShift's patented Mobile Remote Deposit Capture; governance/risk work at
  Wells Fargo (20+ ISO 17799 assessments); infrastructure for First
  National Bank of Omaha; CenturyLink's global DDoS mitigation platform.
- Recently a Founding Board Member of newly-launched CGC Security; active
  on LinkedIn re: AI agent governance, identity/access, zero trust.
  CyberGeist's tagline: "Reverse Engineering Bad Behaviors."
- Company is small — Robert is clearly the visible/active public face, no
  other CyberGeist person shows up in the company's recent LinkedIn
  activity. (One of 6 LinkedIn members listing CyberGeist as workplace
  shares his surname — likely family, unconfirmed role, not worth citing
  to him.)

**Framing:** Robert is a CISO-caliber technical/security peer, already
primed by Kathy to expect something good. Treat this like the "working
partner, not a customer to perform for" framing the 8/8 plan already used
for Kathy — walk the real thing, be upfront that extraction is still a mock
keyword-matching adapter rather than a real LLM if evidence quality comes
up, and don't overstate what's running.

## The one thing this demo has to do

Unchanged from 8/8, still correct:

> Type a topic, instantly see which organizations across sectors are working
> on it — with the evidence to back it up.

## What's changed since 8/8 (per git log, needs re-verifying live, not assumed)

The 8/8 plan predates a batch of follow-on work — real interactive graph
viz, click-to-clear-selection, live pipeline operations on `/pipeline`
("Behind the scenes"), a Playwright report, and more. **Don't reuse the 8/8
"what you're actually demoing" section as-is** — it describes an earlier
state. Today's job is to establish current state fresh (see verification
plan below) and write down what's actually true right now, not copy
forward what was true five days ago.

## Today's plan

1. **Full clean rebuild** — `make clean` then a from-scratch `make up-web`,
   proving nothing stale is propping up a demo that wouldn't survive a real
   cold start. (Mirrors guardrail 1 from the 8/8 plan: prove, don't assume.)
2. **Re-verify the core loop end to end** — sign in as `demo-analyst`/`demo`,
   confirm the graph has real data (ingestion has run since 8/8 per the
   `ingestion-run-pipeline` merge — confirm counts, don't assume empty or
   full), search a topic, confirm orgs + confidence + evidence render,
   check `/pipeline` loads and its live controls work.
3. **Run the test suites** — `make test` (API), `make test-ingest`
   (ingestion), `make test-web` (needs `make up-web` already running —
   vitest + Playwright e2e) — to catch regressions before Robert does.
4. **Update this doc with the real current-state findings** — cheat sheet,
   what's actually demoable, talking points — once verification is done,
   not before.
5. **Confirm a time with Robert** — pick from his offered windows (today
   after 13:00 / tomorrow after 10am Pacific) once the above gives a real
   go/no-go read on readiness.

## Verification log

All steps run for real today, in order, on branch `2026.08.13/robert-demo-prep`:

- **~10:44am — `make clean` then `make up-web`, from scratch.** All five
  containers (`cip-neo4j`, `cip-kc-postgres`, `cip-keycloak`, `cip-api`,
  `cip-web`) came up healthy. `cip-api` reported `Application startup
  complete` and answered `/health` 200 OK. `cip-web` reported `✓ Ready in
  358ms` on `http://localhost:3000`. Keycloak imported the `platform` realm
  clean and bootstrapped in ~13.6s.
- **~10:47am — signed in as `demo-analyst` / `demo`**, both in the sandbox
  browser and again in Rob's real Chrome profile (separate session/cookies,
  both worked). Landed on "Sign in with Keycloak" → Keycloak login →
  redirected back signed in, as expected on a clean volume.
- **~10:47am — confirmed the graph starts genuinely empty** (searching
  "cybersecurity" returned "No organizations found... yet" — not a bug,
  proof this is a real clean slate, not leftover 8/8 data).
- **~10:48am — `/pipeline` → "Reset to clean demo set"** loaded instantly:
  **6 organizations, 8 topics, 29 connections**, live from Neo4j
  (Lumen Technologies, Verizon, NextEra Energy, Zscaler, Deloitte,
  Health-ISAC). Noted in passing: **CyberGeist Security (Robert's own
  company) is already in the 26-org seed list**, flagged "No URL on
  file — can't be scraped until one is confirmed." Worth fixing before
  the call — see cheat sheet above.
- **~10:50am — searched "threat intelligence"** on `/`: returned 5 orgs
  across 4 sectors (Communications, Coordination Layer, Risk/Consulting,
  Cybersecurity), each with a confidence % (75–84%) and a verbatim quote
  pulled from the org's real cached page. This is the core demo claim,
  proven live, not assumed from the 8/8 doc.
- **~10:50–10:51am — full test suite, all green:**
  - `make test` (API): **4/4 passed**
  - `make test-ingest`: **16/16 passed**
  - `make test-web` (vitest + Playwright e2e, against the live stack):
    vitest had no unit test files to run (`--passWithNoTests`, exit 0 —
    expected, not a gap introduced today); Playwright **6/6 passed**,
    including both login specs and the full `demo.spec.ts` suite (topic
    search with evidence, `/pipeline` live stats + graph interactivity,
    reset/run controls).

**Read:** the app is in a genuinely demoable state right now, verified end
to end on a cold, from-scratch build — not carried over by assumption from
8/8. Only open item is the CyberGeist seed-URL fix noted above, which is a
nice-to-have, not a blocker.

- **~10:56am — ran `./scripts/preflight-check.sh --headed`**, the same
  script used to prep the 8/8 Kathy demo, watched live in Terminal:
  clean slate → local login proven → tunnel up → tunnel login proven →
  tunnel down → tunnel URLs proven actually gone (HTTP 530s) → local
  login proven again. Finished 6/6, stack left running local-only, ready
  to walk into the call. Second independent confirmation of readiness on
  top of the manual pass above, using the exact flow already proven at
  the table for Kathy.

## Outcome

**Demo happened 11:00am–12:21pm, 2026-08-13.** Went well. Confirmed
directly with Robert rather than by picking one of his two offered email
windows — actual time landed outside both. CyberGeist Security's URL was
not added to the seed list beforehand (see note above); worth following up
with Robert directly for the right URL before it's added.
