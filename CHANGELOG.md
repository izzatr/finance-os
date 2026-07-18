# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- International end-of-day investment portfolios backed by Yahoo Finance, with multiple investment wallets, native/base-currency valuation, position-aware history, bounded backfills, refresh leasing, and strict tenant and wallet invariants.
- A restricted, configurable Cloudflare Worker fallback for Yahoo Finance egress.

### Changed
- Production containers and CI now use Node.js 22, reproducible `npm ci` installs, pinned base images, and container health checks.

### Security
- Removed all known high-severity dependency advisories, pinned GitHub Actions, added Dependabot, made the API container non-root, hardened production startup validation, and added browser security headers.
- Hardened the Yahoo proxy with an explicit source-IP binding, strict route/query validation, bounded chart ranges, upstream timeouts, and generic error responses.

## [0.1.0] - 2026-03-28

### Added
- Initial release
- Wallet-based double-entry accounting with multi-currency support (IDR, EUR, USD)
- REST API with OpenAPI documentation
- React dashboard with shadcn/ui components
- Analytics: monthly trends, category breakdown, asset growth, spending reports
- MCP server for AI agent integration
- CLI with balance, search, export, reconcile commands
- Custom import workflows via scripts or bulk API payloads
- Safe sample data and docs cleanup for public repo readiness
- Docker Compose deployment
- Soft-delete for transactions and wallets
- Better Auth integration (email/password, OAuth, API keys)
