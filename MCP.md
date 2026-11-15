# SearchX read-only MCP server

`https://searchx.earth/mcp` is the planned public Streamable HTTP endpoint after this branch is deployed. It uses the official MCP TypeScript SDK in stateless mode. There are no accounts or write tools.

Connect a compatible MCP client by adding a **remote Streamable HTTP server** with that URL. For clients that accept JSON MCP server configuration, the shape is typically:

```json
{
  "mcpServers": {
    "searchx": { "url": "https://searchx.earth/mcp" }
  }
}
```

Client configuration names differ; use the client's remote MCP instructions. The endpoint requires HTTPS in production. Local testing uses `http://127.0.0.1:PORT/mcp`.

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `search_objects` | `query` | Matching objects in the curated catalog, with page URLs |
| `get_object` | `object` slug, name, or catalog ID | Identity, description, ICRS pointing center, sources and position limitation |
| `get_observations` | `object` | Live NASA/IPAC IRSA SPHEREx DR1/QR3 exposure metadata or explicit empty/service-error state |
| `get_image` | `object` | NASA-published astronomy image URL, attribution and limitation |
| `get_evidence` | `object` | Individual cited claims, limitations, and explicit unverified SIEVE status |

The catalog begins with M 42, M 31, M 1, and M 101. Catalog centers guide the map; they are not new astrometric measurements. Archive matches are positional and do not establish object identity, flux, variability, or a SIEVE detection. No physical distances or model-generated conclusions are returned. SPHEREx observations are queried at call time; no frames are claimed when IRSA returns none or is unavailable.

The MCP endpoint uses the same Upstash Redis configuration as map invites (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `MAP_SESSION_SECRET`) for distributed per-IP rate limiting. It returns HTTP 503 until those variables are configured, and HTTP 429 above 30 requests/minute per client IP. Vercel overwrites `X-Forwarded-For` to prevent client spoofing; the stored rate-limit key is an HMAC of the address. Only the project's canonical hosts and same-origin browser requests are accepted. Consider a Vercel WAF rule for `/mcp` if traffic grows.

## Verification

`mcp-server.test.js` starts an actual HTTP server and uses the official MCP client SDK to connect, list all five tools, and call each one. The observation test mocks the upstream IRSA response, so it verifies protocol wiring and an honest empty state rather than asserting live archive availability. After deployment, repeat the client test against the production URL and verify live IRSA behavior separately.
