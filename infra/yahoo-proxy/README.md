# Yahoo Finance egress proxy

Finance OS calls Yahoo directly by default. Some shared hosting egress IPs receive Yahoo `429` responses. This Cloudflare Worker provides a narrowly scoped fallback for the two read-only Yahoo JSON endpoints used by Finance OS.

## Configuration

- The API reads the proxy URL from `YAHOO_FINANCE_BASE_URL`. Production stores this as a Zeabur service environment variable; the URL is not hardcoded into the application or committed to a `.env` file.
- Without `YAHOO_FINANCE_BASE_URL`, the API uses `https://query1.finance.yahoo.com` directly.
- The Worker intentionally fixes the upstream origin to Yahoo. It cannot proxy attacker-selected hosts.
- Allowed Zeabur egress addresses live in the Worker binding `ALLOWED_SOURCE_IPS`, configured in `wrangler.jsonc` as a comma-separated allowlist.

## Security controls

- accepts only `GET`
- allows only `/v1/finance/search` and `/v8/finance/chart/:symbol`
- validates and normalizes every accepted query parameter
- caps search results and chart history ranges
- allows only configured production egress IPs
- enforces a 10-second upstream timeout
- returns generic gateway errors without leaking upstream failure details
- disables downstream caching and sets `nosniff`

## Verification

```bash
npm run test:yahoo-proxy
npx wrangler deploy --config infra/yahoo-proxy/wrangler.jsonc
```

After deployment, verify that an ordinary client receives `403`, while a request from the Zeabur API service receives `200`. If the production egress IP changes, update `ALLOWED_SOURCE_IPS`, deploy the Worker first, verify from Zeabur, and only then restart the API.
