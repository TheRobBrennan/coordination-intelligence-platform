# User profile images (avatars)

Profile images for app users, kept in a plain folder so they're easy to manage
without a storage service for the PoC.

## Convention
- One image per user, named after the **Keycloak username**: `rob.svg`, `kathy.svg`, …
- Square, ~256px, `.svg` / `.png` / `.jpg`. `manifest.json` maps username → file.
- Seed users ship with placeholder SVGs (initials). Replace with real images any time.

## Where this folder is mounted
The API container mounts this folder **read-only** at `/srv/avatars`, controlled by
`AVATARS_DIR` in `.env` (see `infra/docker-compose.yml`):

```dotenv
# Leave AVATARS_DIR unset to use this bundled folder (the default).
# To override, use an ABSOLUTE path (a relative one resolves against infra/,
# not the repo root) — an external drive, or a share from a Docker host / VM:
# AVATARS_DIR=/Volumes/team-assets/avatars
# AVATARS_DIR=/mnt/nfs/cip-avatars
```

Because it's a single env var, you can keep avatars on your machine now and move
them to a shared host/VM later without touching code.

## Serving them (planned wiring)
Not built yet — the read API will expose `GET /avatars/{username}` that reads
`AVATARS_DIR`, and the web app will use it (or Keycloak can carry an avatar URL
attribute per user). Until then this folder + manifest just establishes the
convention so the seed data and UI line up from day one.
