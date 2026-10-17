# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems.

Report it privately through GitHub instead:
[**Report a vulnerability**](https://github.com/izzatr/finance-os/security/advisories/new)
(Security tab → "Report a vulnerability"). Only the maintainer can see it.

Helpful to include:

- what an attacker can do, and what they need first (an account, an API key, network access)
- steps or a request that reproduces it
- the commit or image tag you tested

You'll get a reply within a few days. Once a fix ships, the advisory is
published and you're credited unless you'd rather not be.

## Supported versions

Finance OS has no versioned releases yet. Fixes land on `main` and in the
`ghcr.io/izzatr/finance-os-api` / `finance-os-web` images tagged `latest`
and with the commit SHA. If you self-host, keep up with `main`.

## Scope

In scope: the API, web app, MCP server, CLI, database migrations, Docker
images and the Yahoo Finance worker in `infra/`.

Out of scope: problems that need an already-compromised server or admin
account, missing hardening headers with no concrete impact, and issues in
your own reverse proxy or hosting setup.

## Self-hosting

Finance OS stores sensitive financial data. When you run your own instance:

- set a long random `BETTER_AUTH_SECRET` and never reuse the example value
- put the API behind a reverse proxy that sets `X-Forwarded-For` (see the
  cloud hosting guide), and don't expose Postgres to the internet
- treat agent API keys like passwords: give each agent its own key and
  revoke ones you no longer use
