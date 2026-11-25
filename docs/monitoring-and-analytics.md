# Monitoring and analytics

**Last updated:** 2026-11-25

```mermaid
flowchart LR
    UR[UptimeRobot] -->|every 5 minutes| W[cip-preview-web]
    UR -->|every 5 minutes| A[cip-preview-auth, platform realm]
    UR -->|every 5 minutes| N[cip-preview-neo4j]
    UR -->|down or recovered| E([email alert])
```

## Uptime

UptimeRobot, HTTP checks every 5 minutes, email alerts. Monitored:

- `https://cip-preview-web.sploosh.ai/`
- `https://cip-preview-auth.sploosh.ai/realms/platform`
- `https://cip-preview-neo4j.sploosh.ai/`

A passing check means the address answered. It does not test sign-in or a graph query.

## Analytics and error tracking

No analytics or error tracking service was found in the code on 2026-11-25. If one is added, record the
events here and what is never collected.
