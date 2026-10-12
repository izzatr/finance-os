# Currencies

Open **Currencies** in the sidebar (or More on a phone) to set up the currencies your account uses. The settings belong to your account, so they are the same on every device you sign in on.

## Default currency

Pick any supported ISO currency from the searchable list, even if you have no wallets. The change saves as soon as you choose it; a "Saving…" note appears while it is stored, and a failed save shows the error with a **Retry** button.

The default is used for totals, reports, the assistant and as the starting currency in Quick add when you have no wallet yet. Changing it:

- does **not** create any wallet,
- does **not** convert or rewrite any past transaction, and
- is the same setting Shared expenses uses (there is no separate Shared default; Shared settings link here).

Until you choose one, the default is EUR. If you had chosen a default in Shared expenses before accounts stored it, that choice is kept.

### An older browser setting

Earlier versions remembered the default only in the browser. Finance OS never applies that value to an account on its own, because the browser may have been used by someone else. If you have not chosen a default yet and the browser still remembers a different one, a notice asks whether to use it for your account or keep the account's.

## Preferred currencies

Add the currencies you use most (up to 20). They appear first, in the order you added them and after your default, in:

- the Quick add currency picker,
- the currency picker when you add or edit a shared expense, and
- the currency picker when you record a settlement.

Every other supported currency stays one search away (by code or name). Removing a currency from the list only changes ordering.

## Wallets are separate and optional

Each currency row has its own **Create wallet** button. It opens the usual new-wallet dialog with that currency preselected. Choosing, adding or removing a currency never creates a wallet.

## Balances and exchange rates

Below the settings, **Balances** lists what you hold per currency and **Exchange rates** shows today's rates against your default. A currency without a recorded rate shows **No rate**; Finance OS never assumes 1. If the default itself has no rate, totals on Home name the currencies that are left out instead of mixing them in.

## For developers

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/settings/currencies` | `defaultCurrency`, `defaultIsExplicit`, `preferredCurrencies`, `updatedAt` |
| `PATCH` | `/api/settings/currencies` | Partial update of `defaultCurrency` and/or `preferredCurrencies` (ordered; duplicates collapse; at most 20 after de-duplication; unsupported codes are rejected with `422`) |
| `GET` | `/api/currencies` | Supported catalog: `code`, `name`, `precision` (stored asset precision where one exists) |
| `POST` | `/api/assets/currency` | Ensures the reference asset for a supported currency exists; creates no wallet |

Read-only and propose-scoped API keys can read these settings but cannot change them.
