# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- International end-of-day investment portfolios backed by Yahoo Finance, with multiple investment wallets, native/base-currency valuation, position-aware history, bounded backfills, refresh leasing, and strict tenant and wallet invariants.

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
