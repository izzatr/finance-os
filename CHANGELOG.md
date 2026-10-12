# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Account-level currency setup on the Currencies page: choose a default from every supported currency (even with no wallets) and keep an ordered list of preferred currencies that come first in Quick add and in shared expense, edit and settlement pickers. Both are stored per account, so they follow you across devices; the old browser-only default and the separate Shared default are unified, an old browser value is only offered for confirmation, and creating a wallet in a currency stays a separate, optional action. Missing exchange rates are shown as missing rather than assumed to be 1, and currencies use their own number of decimals.
- International end-of-day investment portfolios backed by Yahoo Finance, with multiple investment wallets, native/base-currency valuation, position-aware history, bounded backfills, refresh leasing, and strict tenant and wallet invariants.
- A restricted, configurable Cloudflare Worker fallback for Yahoo Finance egress.

### Changed
- Mobile-first "Ink + Cream" redesign of the web app: ink navy brand surfaces, a single cream accent, warm neutral tint and Onest throughout. Home gets an ink net-worth header with wallet tiles, this month's income and spend, day-grouped activity with daily totals, and one merged top-spending list in the default currency. Quick add gets an on-screen keypad on phones (with a `000` key for rupiah), an icon category grid, one-tap recent merchants and wallet/date/note chips. Dialogs open as bottom sheets on phones, and the wallet detail page lets you edit a transaction by tapping it (editing used to need hover). Reports is rebuilt around questions instead of charts: how this month compares with your usual month, your spending pace by day with a month-end estimate, what changed by category, where the money went, top merchants and cash flow by month. The Assistant and Inbox work properly now: monthly answers match the Reports page, tool calls no longer vanish with some model providers, drafts can be edited, approved or rejected right in the chat or the Inbox, likely duplicates are flagged, and the chat survives navigating away. The landing page is rebuilt in the same style with live-looking app previews, and the unused shader, ASCII and serif/mono web fonts are gone.
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
