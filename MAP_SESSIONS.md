# SearchX map invites

The homepage opens `/maps`. When shared sessions are enabled, visitors can create a map using the two surveys currently supported by the Observatory: DSS2 optical color and SPHEREx DR1 infrared. **All Datasets** makes both available and preserves the ordinary Observatory controls. A map saves its initial ICRS center, field of view, and selected survey. Existing `/observatory` and complete `ra`/`dec`/`fov`/`survey`/`channel` share links remain valid.

Invites are public, read-only, 10-character random codes that expire after 30 days. Anyone with the code can open the map. Do not put private information in a map configuration. Creating and joining are rate-limited per client IP; the IP is HMAC-hashed before the rate-limit key is stored. No account or live collaboration is implied.

## Production storage

Create an Upstash Redis database attached to the **SearchX** Vercel project, then configure these environment variables for Production and Preview:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MAP_SESSION_SECRET` — an independent random server-side secret (at least 32 bytes, generated with a password manager or `openssl rand -hex 32`)
- `SEARCHX_MAPS_ENABLED=1` — release gate, set only after the three settings above and a cross-device test are ready

Redeploy after setting the variables. The server uses Redis `SET ... EX ... NX` for collision-safe expiry and an atomic `EVAL` counter for rate limiting. If the release gate or storage is absent, `/maps` shows the public Observatory entry and the invite API returns HTTP 404. Production invite codes require the shared store. Keep the Redis token and HMAC secret out of source control and client code. A Vercel WAF rule on `/map-sessions*` is an optional extra abuse guard.

For local browser testing only, set `MAP_SESSION_STORE_DIR` to a writable private directory and `SEARCHX_MAPS_ENABLED=1` before starting `node server.mjs`. This file store persists across local process restarts, and its rate limiter is process-local. Never use it in production.

## API

`POST /map-sessions` accepts JSON `{ "datasets": "all" | ["optical", "infrared"], "view": { "ra": 83.82208, "dec": -5.39111, "fov": 2, "survey": "optical" } }`. Infrared starting views also require a nonblank `channel` from 0–101. The response contains a relative `/observatory?map=CODE` path and expiry. `GET /map-sessions/CODE` returns the saved configuration or a clear invalid/expired response. The browser never receives Redis credentials.

To verify after deployment: create an invite on one device, open the link on a second device, confirm position and available survey choices, then verify an invalid code and the 30-day expiry policy. This production check is pending until the Redis configuration is provided.

The create/join forms appear when `SEARCHX_MAPS_ENABLED=1` and the required storage is configured. The public Observatory is available from the map entry in either mode.
