# Yahoo Finance egress proxy

Finance OS calls Yahoo directly by default. Some shared hosting egress IPs receive Yahoo `429` responses. This Cloudflare Worker provides a narrowly scoped fallback for the two read-only Yahoo JSON endpoints used by Finance OS.

Security controls:

- accepts only `GET`
- allows only `/v1/finance/search` and `/v8/finance/chart/:symbol`
- allows only the production Zeabur egress IP
- disables downstream caching

Deploy the Worker, enable its `workers.dev` subdomain, and set `YAHOO_FINANCE_BASE_URL` on the API service. If the production egress IP changes, update the allowlist and redeploy the Worker before changing the API setting.