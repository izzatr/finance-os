# Shared expenses

Split bills with friends the way you would in Splitwise: a running balance with each friend, groups for
trips and households, and settling up. Everything you share also lands in your own books at your share,
so reports and net worth stay right.

## Friends and guests

Add a friend with just a name. They don't need an account: they start as a **guest** that you and anyone
in your groups can use in expenses. When they want their own login, send them an invite link from the
friend's page. The link works once and expires after 14 days. When they sign up through it, every
expense, group and balance they were part of becomes theirs, and they can keep tracking their own money
in Finance OS.

Guests are never matched to accounts by email. Only the invite link connects them.

## Groups

Groups (home, trip, couple, other) hold expenses everyone in them can see and edit. Each group shows
what every member gets back or owes and suggests who should pay whom.

**Simplify debts** (on by default) keeps the number of payments down: if Bea owes you and Cem owes Bea,
Cem pays you directly. Turn it off to settle exactly along who paid for what.

You can only leave a group, or remove someone, once their balance in it is zero. Deleting a group also
deletes its expenses; both come back if you restore the group.

## Adding an expense

- **Paid by**: one person, or several people with the amount each paid.
- **Split**: equally (choose who is in), exact amounts, percentages, shares, or adjustments
  (extra amounts on top of an equal split). Amounts must add up to the total; leftover cents go to
  one person at a time so nothing is lost to rounding.
- **Currency**: choose from the supported ISO currency catalog using the searchable picker; search by code or name. Available currencies do not depend on your personal wallets. Balances are kept per currency and editing an expense preserves its currency until you explicitly change it.
- **Repeat**: weekly, every two weeks, monthly, every three months or yearly. A new copy appears on each date, with the same people, payer and split. Only the newest copy carries the schedule, so stopping the repeat on it stops the series. Dates past the end of a shorter month land on its last day. Everything that repeats is listed under **Repeating** on the Shared page with its next date.
- Comments and a full activity history are shared with everyone involved.

If two people edit the same expense at once, the second save is refused with a message instead of
silently overwriting the first.

### Starting without a wallet

You can add shared expenses with no personal wallets. Add a friend by name, choose the currency and amount, and leave **Only track what friends owe** selected. Finance OS creates its managed Friends accounting wallet automatically; you do not need to create or fund a personal wallet. This records the shared obligation, not an invented cash movement.

If you choose **Paid from a wallet** in a different currency, enter the actual amount charged to that wallet. No exchange rate is inferred. Changing the shared expense currency clears that funding amount so you can confirm it again.

## Settling up

Record a payment from the friend or group page, in full or in part. The searchable currency picker is available for both new and edited payments. Keep **No wallet, just clear the balance** to settle without a personal wallet, or pick the wallet the money left or arrived in to record the transfer too. A different-currency wallet requires an explicitly entered funding amount.

## How it shows up in your books

Each currency you share in gets a **Friends** wallet, for example `Friends · EUR`. Its balance is what
friends owe you (positive) or what you owe them (negative), so it counts in net worth like any other
money that is yours.

When you add an expense you can say which wallet you paid from. Finance OS then books one transaction:
the full amount out of that wallet and the part others owe you into Friends. Reports count only your
share. If the payment is already in your books (for example from a bank import), link that transaction
instead and nothing is counted twice. When someone else paid, your share is booked as spending against
Friends.

These transactions follow the shared expense automatically and can't be edited from the transactions
list; edit the shared expense instead. Your wallet, category and links are private to you.

Joining with history (through an invite) brings in older balances as one opening balance, not as past
spending.

## API

All endpoints live under `/api/split` and accept a session or a write-scoped API key. See
[API endpoints](/api/endpoints#shared-expenses).
