import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'
import { addGuest, api, assertInvariants, friendsWalletBalance, me, testPool, wallet, walletsOf, type Session } from './split-helpers'

const day = (d: string) => `${d}T12:00:00.000Z`
const future = () => new Date(Date.now() + 60_000).toISOString()

async function userPair() {
  const a = await createTestUser(app)
  const b = await createTestUser(app)
  return { a, b }
}

async function expense(s: Session, body: Record<string, unknown>) {
  const r = await api(app, s).post('/api/split/expenses', { kind: 'expense', currency: 'EUR', date: future(), category: 'general', ...body })
  return r
}

describe('shared expenses: friends and guests', () => {
  beforeEach(async () => await truncateAll())
  afterEach(async () => await assertInvariants())

  it('splits a bill with a guest and keeps the Friends wallet and reports right', async () => {
    const { a } = await userPair()
    const bank = await wallet(app, a, 'Bank')
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')

    const r = await expense(a, {
      description: 'Dinner',
      cost: '80.00',
      category: 'dining',
      paid: { kind: 'single', personId: meA.personId },
      split: { method: 'equal', personIds: [meA.personId, sam] },
      myBooks: { fundingWalletId: bank },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)

    const friends = await api(app, a).get('/api/split/friends')
    expect(friends.body.data).toEqual([expect.objectContaining({ personId: sam, name: 'Sam', isGuest: true, balances: [{ currency: 'EUR', amount: '40.00' }] })])
    expect((await me(app, a)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '40.00' }])

    const wallets = await walletsOf(app, a)
    expect(wallets.find((w) => w.id === bank)!.balance).toBe(-80)
    expect(await friendsWalletBalance(app, a, 'EUR')).toBe(40)

    // Reports count only your share.
    const month = new Date().toISOString().slice(0, 7)
    const report = await api(app, a).get(`/api/analytics/month-report?month=${month}&currency=EUR`)
    expect(report.status).toBe(200)
    expect(report.body.data.spent).toBeCloseTo(40, 2)

    // A projection cannot be edited or deleted through the plain transaction API.
    const view = await api(app, a).get(`/api/split/expenses/${r.body.data.id}`)
    const txId = view.body.data.myBooks.transactionId
    expect(txId).toBeTruthy()
    expect((await api(app, a).patch(`/api/transactions/${txId}`, { description: 'hack' })).status).toBe(409)
    expect((await api(app, a).del(`/api/transactions/${txId}`)).status).toBe(409)
  })

  it('records "they paid" correctly: my share becomes spending and a debt', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const r = await expense(a, {
      description: 'Hotel',
      cost: '300',
      category: 'hotel',
      paid: { kind: 'single', personId: sam },
      split: { method: 'shares', shares: { [meA.personId]: '1', [sam]: '2' } },
    })
    expect(r.status).toBe(201)
    expect((await me(app, a)).balances.iOwe).toEqual([{ currency: 'EUR', amount: '100.00' }])
    expect(await friendsWalletBalance(app, a, 'EUR')).toBe(-100)
    const month = new Date().toISOString().slice(0, 7)
    const report = await api(app, a).get(`/api/analytics/month-report?month=${month}&currency=EUR`)
    expect(report.body.data.spent).toBeCloseTo(100, 2)
  })

  it('settles up with a payment linked to a real wallet', async () => {
    const { a } = await userPair()
    const bank = await wallet(app, a, 'Bank')
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    await expense(a, { description: 'Rent', cost: '1400', category: 'rent', paid: { kind: 'single', personId: sam }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const pay = await api(app, a).post('/api/split/expenses', {
      kind: 'payment', cost: '700', currency: 'EUR', date: future(),
      payment: { fromPersonId: meA.personId, toPersonId: sam },
      myBooks: { fundingWalletId: bank },
    })
    expect(pay.status, JSON.stringify(pay.body)).toBe(201)
    expect((await me(app, a)).balances.net).toEqual([])
    expect(await friendsWalletBalance(app, a, 'EUR')).toBe(0)
    expect((await walletsOf(app, a)).find((w) => w.id === bank)!.balance).toBe(-700)
    // Settled: the friend can now be removed.
    expect((await api(app, a).del(`/api/split/friends/${sam}`)).status).toBe(200)
  })

  it('refuses to remove a friend with an open balance', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    await expense(a, { description: 'Taxi', cost: '20', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const r = await api(app, a).del(`/api/split/friends/${sam}`)
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('UNSETTLED')
  })

  it('lists friends with the biggest open balance first, in the default currency', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    await testPool().query(`INSERT INTO exchange_rates (base, quote, rate, as_of, source) VALUES ('EUR', 'IDR', 17000, now(), 'manual') ON CONFLICT DO NOTHING`)
    const small = await addGuest(app, a, 'Ana')
    const big = await addGuest(app, a, 'Ben')
    const idr = await addGuest(app, a, 'Cici')
    await addGuest(app, a, 'Aaron (settled)')
    const debtor = await addGuest(app, a, 'Dewi')
    const pay = (who: string, cost: string, currency = 'EUR', payer = meA.personId) =>
      expense(a, { description: 'x', cost, currency, paid: { kind: 'single', personId: payer }, split: { method: 'equal', personIds: [meA.personId, who] } })
    await pay(small, '20')
    await pay(big, '400')
    await pay(idr, '3400000', 'IDR') // 1,700,000 IDR = 100 EUR: a big raw number, a mid-sized balance
    await pay(debtor, '300', 'EUR', debtor) // I owe 150: owing counts as much as being owed
    const list = (await api(app, a).get('/api/split/friends')).body.data
    expect(list.map((f: any) => f.name)).toEqual(['Ben', 'Dewi', 'Cici', 'Ana', 'Aaron (settled)'])
    expect(list[2].totalInDefault).toEqual({ currency: 'EUR', owedToMe: 100, iOwe: 0, net: 100 })
  })

  it('validates splits server-side', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const bad = await expense(a, { description: 'X', cost: '20', paid: { kind: 'single', personId: meA.personId }, split: { method: 'exact', amounts: { [meA.personId]: '5', [sam]: '5' } } })
    expect(bad.status).toBe(422)
    expect(bad.body.error.code).toBe('SPLIT_TOTAL_MISMATCH')
    const cents = await expense(a, { description: 'X', cost: '20.001', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId] } })
    expect(cents.status).toBe(422)
    const yen = await expense(a, { description: 'Ramen', cost: '3001', currency: 'JPY', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    expect(yen.status).toBe(201)
    const v = await api(app, a).get(`/api/split/expenses/${yen.body.data.id}`)
    expect(v.body.data.shares.map((s: any) => s.owed).sort()).toEqual(['1500', '1501'])
    const unknownCurrency = await expense(a, { description: 'X', cost: '1', currency: 'ZZZ', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId] } })
    expect(unknownCurrency.status).toBe(422)
    // New ISO currencies are created on demand.
    const thb = await expense(a, { description: 'Massage', cost: '500', currency: 'THB', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    expect(thb.status).toBe(201)
  })

  it('edits with optimistic locking, deletes and restores', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const c = await expense(a, { description: 'Groceries', cost: '50', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const id = c.body.data.id
    const body = { kind: 'expense', currency: 'EUR', date: future(), description: 'Groceries', cost: '60', category: 'groceries', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } }
    expect((await api(app, a).patch(`/api/split/expenses/${id}`, { ...body, version: 1 })).status).toBe(200)
    const stale = await api(app, a).patch(`/api/split/expenses/${id}`, { ...body, cost: '70', version: 1 })
    expect(stale.status).toBe(409)
    expect((await me(app, a)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '30.00' }])

    expect((await api(app, a).del(`/api/split/expenses/${id}`)).status).toBe(200)
    expect((await me(app, a)).balances.net).toEqual([])
    expect(await friendsWalletBalance(app, a, 'EUR')).toBe(0)
    const deleted = await api(app, a).get('/api/split/expenses?includeDeleted=true')
    expect(deleted.body.data[0].deletedAt).toBeTruthy()
    expect((await api(app, a).post(`/api/split/expenses/${id}/restore`)).status).toBe(200)
    expect((await me(app, a)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '30.00' }])
  })

  it('handles a paying wallet in another currency', async () => {
    const { a } = await userPair()
    const bank = await wallet(app, a, 'Bank')
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const noAmount = await expense(a, { description: 'Dinner Sydney', cost: '100', currency: 'AUD', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] }, myBooks: { fundingWalletId: bank } })
    expect(noAmount.status).toBe(422)
    expect(noAmount.body.error.code).toBe('FUNDING_AMOUNT_REQUIRED')
    const ok = await expense(a, { description: 'Dinner Sydney', cost: '100', currency: 'AUD', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] }, myBooks: { fundingWalletId: bank, fundingAmount: '61.20' } })
    expect(ok.status).toBe(201)
    expect((await walletsOf(app, a)).find((w) => w.id === bank)!.balance).toBeCloseTo(-61.2, 2)
    expect(await friendsWalletBalance(app, a, 'AUD')).toBe(50)
  })

  it('links an imported bank transaction instead of duplicating the cash leg', async () => {
    const { a } = await userPair()
    const bank = await wallet(app, a, 'Bank')
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const assets = await api(app, a).get('/api/assets')
    const eur = assets.body.data.find((x: any) => x.code === 'EUR').id
    const imported = await api(app, a).post('/api/transactions', { transactionDate: future(), type: 'expense', description: 'EDEKA', entries: [{ walletId: bank, assetId: eur, amount: '-30.00' }] })
    expect(imported.status).toBe(201)
    const r = await expense(a, { description: 'Groceries', cost: '30', category: 'groceries', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] }, myBooks: { linkedTransactionId: imported.body.data.id } })
    expect(r.status).toBe(201)
    expect((await walletsOf(app, a)).find((w) => w.id === bank)!.balance).toBe(-30)
    const month = new Date().toISOString().slice(0, 7)
    const report = await api(app, a).get(`/api/analytics/month-report?month=${month}&currency=EUR`)
    expect(report.body.data.spent).toBeCloseTo(15, 2)
    // The same bank row cannot back two shared expenses.
    const again = await expense(a, { description: 'Groceries 2', cost: '30', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] }, myBooks: { linkedTransactionId: imported.body.data.id } })
    expect(again.status).toBe(409)
  })

  it('blocks direct writes into Friends wallets and deleting them', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    await expense(a, { description: 'Taxi', cost: '20', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const fw = (await walletsOf(app, a)).find((w) => w.systemRole === 'split')!
    const assets = await api(app, a).get('/api/assets')
    const eur = assets.body.data.find((x: any) => x.code === 'EUR').id
    const direct = await api(app, a).post('/api/transactions', { transactionDate: future(), type: 'income', description: 'x', entries: [{ walletId: fw.id, assetId: eur, amount: '5' }] })
    expect(direct.status).toBe(422)
    expect((await api(app, a).del(`/api/wallets/${fw.id}`)).status).toBe(409)
  })
})

describe('shared expenses: groups', () => {
  beforeEach(async () => await truncateAll())
  afterEach(async () => await assertInvariants())

  it('runs a trip with several payers, simplify on and off, and settle-ups', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const b = await addGuest(app, a, 'Bea')
    const c = await addGuest(app, a, 'Cem')
    const g = await api(app, a).post('/api/split/groups', { name: 'Lisbon', groupType: 'trip', memberIds: [b, c] })
    expect(g.status).toBe(201)
    const groupId = g.body.data.id
    // A paid 90 for all three; B paid 60 for B and C. Debts: B owes A 30, C owes A 30, C owes B 30.
    expect((await expense(a, { groupId, description: 'Airbnb', cost: '90', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, b, c] } })).status).toBe(201)
    expect((await expense(a, { groupId, description: 'Dinner', cost: '60', paid: { kind: 'single', personId: b }, split: { method: 'equal', personIds: [b, c] } })).status).toBe(201)

    let group = (await api(app, a).get(`/api/split/groups/${groupId}`)).body.data
    // Simplified (default): C pays A 60. Nets: A +60, B 0, C -60.
    expect(group.suggested).toEqual([{ fromPersonId: c, toPersonId: meA.personId, currency: 'EUR', amount: '60.00' }])
    let friends = (await api(app, a).get('/api/split/friends')).body.data
    expect(friends.find((f: any) => f.personId === c).balances).toEqual([{ currency: 'EUR', amount: '60.00' }])
    expect(friends.find((f: any) => f.personId === b).balances).toEqual([])

    expect((await api(app, a).patch(`/api/split/groups/${groupId}`, { simplifyDebts: false })).status).toBe(200)
    group = (await api(app, a).get(`/api/split/groups/${groupId}`)).body.data
    expect(group.suggested).toHaveLength(3)
    friends = (await api(app, a).get('/api/split/friends')).body.data
    expect(friends.find((f: any) => f.personId === b).balances).toEqual([{ currency: 'EUR', amount: '30.00' }])

    // Cannot remove someone who still owes.
    expect((await api(app, a).del(`/api/split/groups/${groupId}/members/${c}`)).status).toBe(409)
    // Expenses can only involve members.
    const outsider = await addGuest(app, a, 'Dee')
    const bad = await expense(a, { groupId, description: 'x', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, outsider] } })
    expect(bad.status).toBe(422)

    // Settle within the group, then C can be removed.
    await api(app, a).patch(`/api/split/groups/${groupId}`, { simplifyDebts: true })
    const pay = await api(app, a).post('/api/split/expenses', { groupId, kind: 'payment', cost: '60', currency: 'EUR', date: future(), payment: { fromPersonId: c, toPersonId: meA.personId } })
    expect(pay.status).toBe(201)
    expect((await api(app, a).del(`/api/split/groups/${groupId}/members/${c}`)).status).toBe(200)

    // CSV export with members as columns; formula-looking text is neutralised.
    await expense(a, { groupId, description: '=HYPERLINK("x")', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, b] } })
    const csv = await api(app, a).get(`/api/split/groups/${groupId}/export.csv`)
    expect(csv.status).toBe(200)
    expect(csv.body).toContain('Airbnb')
    expect(csv.body).toContain(`"'=HYPERLINK(""x"")"`)
  })

  it('deletes and restores a group together with its expenses', async () => {
    const { a } = await userPair()
    const meA = await me(app, a)
    const b = await addGuest(app, a, 'Bea')
    const groupId = (await api(app, a).post('/api/split/groups', { name: 'Flat', groupType: 'home', memberIds: [b] })).body.data.id
    await expense(a, { groupId, description: 'Internet', cost: '40', category: 'internet', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, b] } })
    expect((await api(app, a).del(`/api/split/groups/${groupId}`)).status).toBe(200)
    expect((await me(app, a)).balances.net).toEqual([])
    expect((await api(app, a).get(`/api/split/groups/${groupId}`)).status).toBe(404)
    expect((await api(app, a).post(`/api/split/groups/${groupId}/restore`)).status).toBe(200)
    expect((await me(app, a)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '20.00' }])
  })
})

describe('shared expenses: invites, real accounts and tenancy', () => {
  beforeEach(async () => {
    await truncateAll()
    delete process.env.ALLOW_REGISTRATION
  })
  afterEach(async () => await assertInvariants())

  async function signUpWithInvite(token: string | null, email: string) {
    return app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 200)}`, ...(token ? { cookie: `fos_invite=${token}` } : {}) },
      body: JSON.stringify({ email, password: 'test-password-123', name: 'Sam' }),
    })
  }

  it('lets a guest sign up through an invite (even with registration closed) and claim their history', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const group = (await api(app, a).post('/api/split/groups', { name: 'Home', groupType: 'couple', memberIds: [sam] })).body.data.id
    await expense(a, { groupId: group, description: 'Rent', cost: '1400', date: day('2026-01-05'), category: 'rent', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })

    // Without an invite, registration stays closed.
    expect((await signUpWithInvite(null, 'nobody@test.local')).status).toBeGreaterThanOrEqual(400)

    const inv = await api(app, a).post(`/api/split/persons/${sam}/invite`)
    expect(inv.status).toBe(200)
    const token = inv.body.data.token as string
    const preview = await api(app, null).get(`/api/public/split-invites/${token}`)
    expect(preview.body.data).toEqual({ status: 'valid', guestName: 'Sam', inviterName: expect.any(String) })

    // The inviter cannot claim their own link.
    expect((await api(app, a).post(`/api/split/invites/${token}/claim`)).status).toBe(422)

    const res = await signUpWithInvite(token, 'sam@test.local')
    expect(res.status).toBe(200)
    const s: Session = { cookie: res.headers.get('set-cookie')!.split(';')[0], userId: '', email: 'sam@test.local' }
    const claim = await api(app, s).post(`/api/split/invites/${token}/claim`)
    expect(claim.status, JSON.stringify(claim.body)).toBe(200)
    expect(claim.body.data.mergedGuestId).toBe(sam)

    // The link is single-use.
    expect((await api(app, s).post(`/api/split/invites/${token}/claim`)).status).toBe(410)
    expect((await api(app, null).get(`/api/public/split-invites/${token}`)).body.data.status).toBe('claimed')

    // Sam now sees the group and owes 700; her books carry it as an opening balance, not spending.
    const meS = await me(app, s)
    expect(meS.balances.iOwe).toEqual([{ currency: 'EUR', amount: '700.00' }])
    expect((await api(app, s).get('/api/split/groups')).body.data[0].name).toBe('Home')
    expect(await friendsWalletBalance(app, s, 'EUR')).toBe(-700)
    const jan = await api(app, s).get('/api/analytics/month-report?month=2026-01&currency=EUR')
    expect(jan.body.data.spent).toBe(0)

    // Alex sees Sam as a registered friend now.
    const friendsA = (await api(app, a).get('/api/split/friends')).body.data
    expect(friendsA).toEqual([expect.objectContaining({ personId: meS.personId, isGuest: false, balances: [{ currency: 'EUR', amount: '700.00' }] })])

    // New expenses after joining show up in both people's books.
    await expense(s, { groupId: group, description: 'Groceries', cost: '60', category: 'groceries', paid: { kind: 'single', personId: meS.personId }, split: { method: 'equal', personIds: [meA.personId, meS.personId] } })
    expect((await me(app, a)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '670.00' }])
    expect(await friendsWalletBalance(app, s, 'EUR')).toBe(-670)

    // Either side can edit; activity reaches both.
    const activity = (await api(app, a).get('/api/split/activity')).body.data
    expect(activity.some((x: any) => x.kind === 'expense.created' && x.actorName === 'Sam')).toBe(true)
  })

  it('merges a guest into an account that already has history', async () => {
    const a = await createTestUser(app)
    const b = await createTestUser(app)
    const meA = await me(app, a)
    const meB = await me(app, b)
    const guestB = await addGuest(app, a, 'Bo (guest)')
    await expense(a, { description: 'Concert', cost: '100', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, guestB] } })
    // B independently tracks something with their own guest of A.
    const guestA = await addGuest(app, b, 'Ana (guest)')
    await expense(b, { description: 'Lunch', cost: '30', paid: { kind: 'single', personId: meB.personId }, split: { method: 'equal', personIds: [meB.personId, guestA] } })
    const token = (await api(app, a).post(`/api/split/persons/${guestB}/invite`)).body.data.token
    expect((await api(app, b).post(`/api/split/invites/${token}/claim`)).status).toBe(200)
    expect((await me(app, b)).balances.iOwe).toEqual([{ currency: 'EUR', amount: '50.00' }])
    expect((await me(app, b)).balances.owedToMe).toEqual([{ currency: 'EUR', amount: '15.00' }])
    // A's original person and B's guest of A are still different until A claims B's invite.
    const token2 = (await api(app, b).post(`/api/split/persons/${guestA}/invite`)).body.data.token
    expect((await api(app, a).post(`/api/split/invites/${token2}/claim`)).status).toBe(200)
    expect((await me(app, a)).balances.net).toEqual([{ currency: 'EUR', amount: '35.00' }])
    expect((await me(app, b)).balances.net).toEqual([{ currency: 'EUR', amount: '-35.00' }])
  })

  it('never lets a stranger see or touch shared data', async () => {
    const a = await createTestUser(app)
    const x = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const groupId = (await api(app, a).post('/api/split/groups', { name: 'Private', memberIds: [sam] })).body.data.id
    const e = await expense(a, { groupId, description: 'Secret', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const id = e.body.data.id
    const meX = await me(app, x)
    const sx = api(app, x)
    expect((await sx.get(`/api/split/expenses/${id}`)).status).toBe(404)
    expect((await sx.del(`/api/split/expenses/${id}`)).status).toBe(404)
    expect((await sx.get(`/api/split/groups/${groupId}`)).status).toBe(404)
    expect((await sx.post(`/api/split/groups/${groupId}/members`, { name: 'Me' })).status).toBe(404)
    expect((await sx.get(`/api/split/expenses/${id}/comments`)).status).toBe(404)
    expect((await sx.post(`/api/split/expenses/${id}/comments`, { body: 'hi' })).status).toBe(404)
    expect((await sx.get(`/api/split/friends/${sam}`)).status).toBe(404)
    expect((await sx.post(`/api/split/persons/${sam}/invite`)).status).toBe(404)
    expect((await sx.patch(`/api/split/friends/${sam}`, { name: 'pwned' })).status).toBe(404)
    // Cannot drag A's people into X's expenses.
    const drag = await expense(x, { description: 'x', cost: '10', paid: { kind: 'single', personId: meX.personId }, split: { method: 'equal', personIds: [meX.personId, sam] } })
    expect(drag.status).toBe(404)
    const drag2 = await expense(x, { description: 'x', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meX.personId] } })
    expect(drag2.status).toBe(404)
    expect((await sx.get('/api/split/expenses')).body.data).toEqual([])
    expect((await sx.get('/api/split/activity')).body.data).toEqual([])
    expect((await sx.get(`/api/split/expenses?groupId=${groupId}`)).body.data).toEqual([])
    // A book entry for X on A's expense is impossible.
    expect((await sx.put(`/api/split/expenses/${id}/my-books`, { categoryId: null })).status).toBe(404)
  })

  it('rejects API keys that are not write-scoped and requires a session to claim', async () => {
    const a = await createTestUser(app)
    const sam = await addGuest(app, a, 'Sam')
    const token = (await api(app, a).post(`/api/split/persons/${sam}/invite`)).body.data.token
    const keyRes = await app.request('/auth/api-key/create', { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: JSON.stringify({ name: 'ro', metadata: { scope: 'read' } }) })
    expect(keyRes.status).toBe(200)
    const key = (await keyRes.json()).key as string
    const w = await app.request('/api/split/friends', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ name: 'x' }) })
    expect(w.status).toBe(403)
    const r = await app.request('/api/split/friends', { headers: { 'x-api-key': key } })
    expect(r.status).toBe(200)
    // Even a write key cannot accept an invite: that must be a person signing in.
    const b = await createTestUser(app)
    const wk = await app.request('/auth/api-key/create', { method: 'POST', headers: { 'content-type': 'application/json', cookie: b.cookie }, body: JSON.stringify({ name: 'w', metadata: { scope: 'write' } }) })
    const writeKey = (await wk.json()).key as string
    const claim = await app.request(`/api/split/invites/${token}/claim`, { method: 'POST', headers: { 'x-api-key': writeKey } })
    expect(claim.status).toBe(403)
  })

  it('expires and revokes invites', async () => {
    const a = await createTestUser(app)
    const b = await createTestUser(app)
    const sam = await addGuest(app, a, 'Sam')
    const first = (await api(app, a).post(`/api/split/persons/${sam}/invite`)).body.data.token
    const second = (await api(app, a).post(`/api/split/persons/${sam}/invite`)).body.data.token
    expect((await api(app, b).post(`/api/split/invites/${first}/claim`)).status).toBe(410)
    await testPool().query(`UPDATE split_invites SET expires_at = now() - interval '1 minute'`)
    expect((await api(app, b).post(`/api/split/invites/${second}/claim`)).status).toBe(410)
    expect((await api(app, b).post('/api/split/invites/not-a-real-token-but-long-enough/claim')).status).toBe(404)
  })
})

describe('shared expenses: integrity', () => {
  beforeEach(async () => await truncateAll())
  afterEach(async () => await assertInvariants())

  it('rejects unbalanced shares at the database level', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const e = await expense(a, { description: 'x', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    await expect(testPool().query(`UPDATE split_expense_shares SET owed_share = owed_share + 1 WHERE expense_id = $1 AND person_id = $2`, [e.body.data.id, sam]))
      .rejects.toThrow(/unbalanced/)
  })

  it('stays consistent under concurrent writes', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => expense(a, {
      description: `Item ${i}`,
      cost: `${10 + i}.11`,
      paid: { kind: 'single', personId: i % 2 ? meA.personId : sam },
      split: { method: 'equal', personIds: [meA.personId, sam] },
      ...(i % 3 === 0 ? { date: day('2020-01-01') } : {}),
    })))
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201))
  })

  it('converts the old people/splits model once', async () => {
    const a = await createTestUser(app)
    const bank = await wallet(app, a, 'Bank')
    const p = testPool()
    const eur = (await p.query(`SELECT id FROM assets WHERE code = 'EUR'`)).rows[0].id
    const person = (await p.query(`INSERT INTO people (user_id, name) VALUES ($1, 'Alice') RETURNING id`, [a.userId])).rows[0].id
    const tx = (await p.query(`INSERT INTO transactions (user_id, transaction_date, type, description) VALUES ($1, '2026-03-03T12:00:00Z', 'expense', 'Dinner') RETURNING id`, [a.userId])).rows[0].id
    await p.query(`INSERT INTO transaction_entries (transaction_id, wallet_id, asset_id, amount) VALUES ($1, $2, $3, '-60')`, [tx, bank, eur])
    await p.query(`INSERT INTO transaction_splits (transaction_id, person_id, asset_id, amount) VALUES ($1, $2, $3, '20')`, [tx, person, eur])
    const before = await api(app, a).get('/api/analytics/month-report?month=2026-03&currency=EUR')
    expect(before.body.data.spent).toBeCloseTo(40, 2)

    const meA = await me(app, a)
    expect(meA.balances.owedToMe).toEqual([{ currency: 'EUR', amount: '20.00' }])
    const after = await api(app, a).get('/api/analytics/month-report?month=2026-03&currency=EUR')
    expect(after.body.data.spent).toBeCloseTo(40, 2)
    expect((await walletsOf(app, a)).find((w) => w.id === bank)!.balance).toBe(-60)
    await me(app, a) // idempotent
    expect((await api(app, a).get('/api/split/expenses')).body.data).toHaveLength(1)
  })

  it('repeats a recurring expense exactly once per period', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 15, 12))
    const r = await expense(a, { description: 'Netflix', cost: '18', category: 'internet', date: start.toISOString(), repeatInterval: 'monthly', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    expect(r.status).toBe(201)
    const { materializeDueSplitExpenses } = await import('../split/recurring')
    const later = new Date(start.getTime() + 40 * 86_400_000)
    const [first, second] = await Promise.all([materializeDueSplitExpenses(later), materializeDueSplitExpenses(later)])
    expect(first.created + second.created).toBe(1)
    const list = (await api(app, a).get('/api/split/expenses')).body.data
    const next = new Date(start)
    next.setUTCMonth(next.getUTCMonth() + 1)
    expect(list.map((e: any) => e.date.slice(0, 10))).toEqual([next.toISOString().slice(0, 10), start.toISOString().slice(0, 10)])
    expect(list[0].repeatInterval).toBe('monthly')
    expect(list[1].repeatInterval).toBe('never')
  })

  it('moves over from a hand-kept Splitwise wallet without touching past reports', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sw = await wallet(app, a, 'Splitwise €')
    const eur = (await testPool().query(`SELECT id FROM assets WHERE code = 'EUR'`)).rows[0].id
    // Old hand-kept rows: an expense of 40 that Sam paid for (close to, but not exactly, the truth).
    const legacy = await api(app, a).post('/api/transactions', { transactionDate: day('2026-05-10'), type: 'expense', description: 'Hotel', entries: [{ walletId: sw, assetId: eur, amount: '-40' }] })
    expect(legacy.status).toBe(201)
    const mayBefore = (await api(app, a).get('/api/analytics/month-report?month=2026-05&currency=EUR')).body.data.spent

    expect((await api(app, a).patch('/api/split/me', { booksStart: day('2026-10-01') })).status).toBe(200)
    expect((await api(app, a).post('/api/split/me/adopt-wallet', { walletId: sw })).status).toBe(200)
    expect((await api(app, a).post('/api/split/me/adopt-wallet', { walletId: sw })).status).toBe(409)

    // Import the real history: the hotel was 100 and split equally, so the truth is -50.
    const sam = await addGuest(app, a, 'Sam')
    const hotel = await expense(a, { description: 'Hotel', cost: '100', date: day('2026-05-10'), category: 'hotel', paid: { kind: 'single', personId: sam }, split: { method: 'equal', personIds: [meA.personId, sam] }, externalRef: 'splitwise:expense:1' })
    expect(hotel.status).toBe(201)
    expect((await expense(a, { description: 'Hotel', cost: '100', date: day('2026-05-10'), paid: { kind: 'single', personId: sam }, split: { method: 'equal', personIds: [meA.personId, sam] }, externalRef: 'splitwise:expense:1' })).status).toBe(409)

    const wallets = await walletsOf(app, a)
    expect(wallets.find((w) => w.id === sw)).toMatchObject({ systemRole: 'split', balance: -50 })
    expect(wallets.filter((w) => w.systemRole === 'split')).toHaveLength(1)
    expect((await api(app, a).get('/api/analytics/month-report?month=2026-05&currency=EUR')).body.data.spent).toBe(mayBefore)
    // Legacy rows inside the adopted wallet are now read-only too.
    expect((await api(app, a).del(`/api/transactions/${legacy.body.data.id}`)).status).toBe(409)

    // After the cut-over, shared expenses count normally.
    await expense(a, { description: 'Dinner', cost: '60', date: day('2026-10-05'), category: 'dining', paid: { kind: 'single', personId: sam }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    expect((await api(app, a).get('/api/analytics/month-report?month=2026-10&currency=EUR&today=2026-10-11')).body.data.spent).toBeCloseTo(30, 2)
    expect(await friendsWalletBalance(app, a, 'EUR')).toBe(-80)
  })

  it('comments are visible to participants only and deletable by their author', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const sam = await addGuest(app, a, 'Sam')
    const e = await expense(a, { description: 'x', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, sam] } })
    const c = await api(app, a).post(`/api/split/expenses/${e.body.data.id}/comments`, { body: 'paid with the joint card' })
    expect(c.status).toBe(201)
    const list = await api(app, a).get(`/api/split/expenses/${e.body.data.id}/comments`)
    expect(list.body.data).toEqual([expect.objectContaining({ body: 'paid with the joint card', isMine: true })])
    expect((await api(app, a).del(`/api/split/comments/${c.body.data.id}`)).status).toBe(200)
  })
})

describe('shared expenses: security review regressions', () => {
  beforeEach(async () => {
    await truncateAll()
    delete process.env.ALLOW_REGISTRATION
  })
  afterEach(async () => await assertInvariants())

  async function signUp(token: string, email: string) {
    return app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.8.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`, cookie: `fos_invite=${token}` },
      body: JSON.stringify({ email, password: 'test-password-123', name: 'X' }),
    })
  }

  it('only the guest creator can mint an invite', async () => {
    const a = await createTestUser(app)
    const c = await createTestUser(app)
    const meC = await me(app, c)
    const gina = await addGuest(app, a, 'Gina')
    const cGuestOfA = await addGuest(app, a, 'C as guest')
    const shared = (await api(app, a).post('/api/split/groups', { name: 'Y', memberIds: [gina, cGuestOfA] })).body.data.id
    // Bring the real C into group Y by claiming A's guest of C.
    const tok = (await api(app, a).post(`/api/split/persons/${cGuestOfA}/invite`)).body.data.token
    expect((await api(app, c).post(`/api/split/invites/${tok}/claim`)).status).toBe(200)
    expect((await api(app, c).get(`/api/split/groups/${shared}`)).status).toBe(200)
    const r = await api(app, c).post(`/api/split/persons/${gina}/invite`)
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('NOT_GUEST_OWNER')
    void meC
  })

  it('one invite link opens closed registration exactly once', async () => {
    const a = await createTestUser(app)
    const g = await addGuest(app, a, 'G')
    const token = (await api(app, a).post(`/api/split/persons/${g}/invite`)).body.data.token
    expect((await signUp(token, 'one@test.local')).status).toBe(200)
    expect((await signUp(token, 'two@test.local')).status).toBeGreaterThanOrEqual(400)
  })

  it('someone who left a group can read but no longer change its expenses', async () => {
    const a = await createTestUser(app)
    const c = await createTestUser(app)
    const meA = await me(app, a)
    const cg = await addGuest(app, a, 'C')
    const gid = (await api(app, a).post('/api/split/groups', { name: 'Flat', memberIds: [cg] })).body.data.id
    const tok = (await api(app, a).post(`/api/split/persons/${cg}/invite`)).body.data.token
    await api(app, c).post(`/api/split/invites/${tok}/claim`)
    const meC = await me(app, c)
    const e = await expense(a, { groupId: gid, description: 'Rent', cost: '20', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, meC.personId] } })
    await api(app, c).post('/api/split/expenses', { groupId: gid, kind: 'payment', cost: '10', currency: 'EUR', date: future(), payment: { fromPersonId: meC.personId, toPersonId: meA.personId } })
    expect((await api(app, a).del(`/api/split/groups/${gid}/members/${meC.personId}`)).status).toBe(200)
    const id = e.body.data.id
    expect((await api(app, c).get(`/api/split/expenses/${id}`)).status).toBe(200)
    expect((await api(app, c).del(`/api/split/expenses/${id}`)).status).toBe(403)
    const rewrite = await api(app, c).patch(`/api/split/expenses/${id}`, { kind: 'expense', groupId: null, currency: 'EUR', date: future(), description: 'x', cost: '20', version: 1, paid: { kind: 'single', personId: meC.personId }, split: { method: 'equal', personIds: [meA.personId] } })
    expect(rewrite.status).toBe(403)
    expect((await api(app, c).post(`/api/split/expenses/${id}/comments`, { body: 'hi' })).status).toBe(403)
  })

  it('a member cannot be removed while an expense for them is being written', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    for (let i = 0; i < 6; i++) {
      const gid = (await api(app, a).post('/api/split/groups', { name: `R${i}`, memberIds: [g] })).body.data.id
      const [created, removed] = await Promise.all([
        expense(a, { groupId: gid, description: 'x', cost: '10', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } }),
        api(app, a).del(`/api/split/groups/${gid}/members/${g}`),
      ])
      expect(created.status === 201 && removed.status === 200).toBe(false)
    }
  })

  it('an old repeating expense makes one copy, not a backlog', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    await expense(a, { description: 'Gym', cost: '10', date: day('2001-01-01'), repeatInterval: 'weekly', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } })
    const { materializeDueSplitExpenses } = await import('../split/recurring')
    const r = await materializeDueSplitExpenses(new Date())
    expect(r.created).toBe(0) // the next occurrence is already in the future
  })

  it('a linked bank transaction is locked and the projection takes its date', async () => {
    const a = await createTestUser(app)
    const bank = await wallet(app, a, 'Bank')
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    const eur = (await testPool().query(`SELECT id FROM assets WHERE code = 'EUR'`)).rows[0].id
    const charge = await api(app, a).post('/api/transactions', { transactionDate: day('2026-08-01'), type: 'expense', description: 'Card', entries: [{ walletId: bank, assetId: eur, amount: '-80' }] })
    await expense(a, { description: 'Dinner', cost: '80', date: day('2026-07-31'), paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] }, myBooks: { linkedTransactionId: charge.body.data.id } })
    expect((await api(app, a).del(`/api/transactions/${charge.body.data.id}`)).status).toBe(409)
    const jul = (await api(app, a).get('/api/analytics/month-report?month=2026-07&currency=EUR')).body.data.spent
    const aug = (await api(app, a).get('/api/analytics/month-report?month=2026-08&currency=EUR')).body.data.spent
    expect(jul).toBe(0)
    expect(aug).toBeCloseTo(40, 2)
  })

  it('rejects oversized amounts and maps cleanly', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const big = await expense(a, { description: 'x', cost: '99999999999999', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId] } })
    expect(big.status).toBe(400)
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, '1']))
    const wide = await expense(a, { description: 'x', cost: '150', paid: { kind: 'single', personId: meA.personId }, split: { method: 'exact', amounts: many } })
    expect(wide.status).toBe(400)
  })

  it('a read-only key does not run the legacy conversion', async () => {
    const a = await createTestUser(app)
    const keyRes = await app.request('/auth/api-key/create', { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: JSON.stringify({ name: 'ro', metadata: { scope: 'read' } }) })
    const key = (await keyRes.json()).key as string
    expect((await app.request('/api/split/me', { headers: { 'x-api-key': key } })).status).toBe(200)
    const row = await testPool().query(`SELECT legacy_migrated_at FROM split_user_settings WHERE user_id = $1`, [a.userId])
    expect(row.rows[0].legacy_migrated_at).toBeNull()
  })

  it('exports negative balances as numbers and yen without decimals', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    const gid = (await api(app, a).post('/api/split/groups', { name: 'T', memberIds: [g] })).body.data.id
    await expense(a, { groupId: gid, description: 'Yen', cost: '1001', currency: 'JPY', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } })
    const csv = (await api(app, a).get(`/api/split/groups/${gid}/export.csv`)).body as string
    expect(csv).toMatch(/Yen,general,1001,JPY,(500,-500|-500,500|501,-501|-501,501)/)
    expect(csv).not.toContain(`'-`)
  })

  it('restoring a group restarts its repeating expenses', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    const gid = (await api(app, a).post('/api/split/groups', { name: 'Home', memberIds: [g] })).body.data.id
    await expense(a, { groupId: gid, description: 'Rent', cost: '10', repeatInterval: 'monthly', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } })
    await api(app, a).del(`/api/split/groups/${gid}`)
    await api(app, a).post(`/api/split/groups/${gid}/restore`)
    const row = await testPool().query(`SELECT next_repeat_at FROM split_expenses WHERE group_id = $1`, [gid])
    expect(row.rows[0].next_repeat_at).not.toBeNull()
  })

  it('PATCH requires a version and keeps the repeat when omitted', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'G')
    const e = await expense(a, { description: 'Gym', cost: '10', repeatInterval: 'monthly', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } })
    const body = { kind: 'expense', currency: 'EUR', date: future(), description: 'Gym', cost: '12', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g] } }
    expect((await api(app, a).patch(`/api/split/expenses/${e.body.data.id}`, body)).status).toBe(400)
    expect((await api(app, a).patch(`/api/split/expenses/${e.body.data.id}`, { ...body, version: 1 })).status).toBe(200)
    expect((await api(app, a).get(`/api/split/expenses/${e.body.data.id}`)).body.data.repeatInterval).toBe('monthly')
  })
})

describe('shared expenses: importing comments', () => {
  beforeEach(async () => await truncateAll())
  afterEach(async () => await assertInvariants())

  async function imported(a: Awaited<ReturnType<typeof createTestUser>>, meId: string, guest: string, ref = 'splitwise:expense:1') {
    const r = await expense(a, { description: 'Dinner', cost: '20', externalRef: ref, paid: { kind: 'single', personId: meId }, split: { method: 'equal', personIds: [meId, guest] } })
    return r.body.data.id as string
  }

  it('keeps the author and time, is idempotent and stays out of activity', async () => {
    const a = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'Sam')
    const id = await imported(a, meA.personId, g)
    const before = (await api(app, a).get('/api/split/activity')).body.data.length
    const body = { authorPersonId: g, body: 'I paid the tip', createdAt: '2024-03-03T19:00:00.000Z', externalRef: 'splitwise:comment:9' }
    const first = await api(app, a).post(`/api/split/expenses/${id}/comments/import`, body)
    expect(first.status).toBe(200)
    expect(first.body.data.created).toBe(true)
    const again = await api(app, a).post(`/api/split/expenses/${id}/comments/import`, body)
    expect(again.body.data.created).toBe(false)
    const comments = (await api(app, a).get(`/api/split/expenses/${id}/comments`)).body.data
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({ personId: g, name: 'Sam', body: 'I paid the tip', createdAt: '2024-03-03T19:00:00.000Z', isMine: false })
    expect((await api(app, a).get('/api/split/activity')).body.data.length).toBe(before)
  })

  it('the comment follows the guest when they claim their invite', async () => {
    const a = await createTestUser(app)
    const b = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'Sam')
    const id = await imported(a, meA.personId, g)
    await api(app, a).post(`/api/split/expenses/${id}/comments/import`, { authorPersonId: g, body: 'hi', createdAt: '2024-01-01T10:00:00.000Z', externalRef: 'c:1' })
    const tok = (await api(app, a).post(`/api/split/persons/${g}/invite`)).body.data.token
    expect((await api(app, b).post(`/api/split/invites/${tok}/claim`)).status).toBe(200)
    const meB = await me(app, b)
    const comments = (await api(app, b).get(`/api/split/expenses/${id}/comments`)).body.data
    expect(comments[0]).toMatchObject({ personId: meB.personId, isMine: true })
  })

  it('cannot put words in a registered user\u2019s mouth, or on expenses you did not import', async () => {
    const a = await createTestUser(app)
    const b = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'B as guest')
    const tok = (await api(app, a).post(`/api/split/persons/${g}/invite`)).body.data.token
    await api(app, b).post(`/api/split/invites/${tok}/claim`)
    const meB = await me(app, b)
    const id = await imported(a, meA.personId, meB.personId)
    const asB = await api(app, a).post(`/api/split/expenses/${id}/comments/import`, { authorPersonId: meB.personId, body: 'x', createdAt: '2024-01-01T10:00:00.000Z', externalRef: 'c:2' })
    expect(asB.status).toBe(403)
    expect(asB.body.error.code).toBe('AUTHOR_NOT_ALLOWED')
    // B can see the expense but did not import it.
    const byB = await api(app, b).post(`/api/split/expenses/${id}/comments/import`, { authorPersonId: meB.personId, body: 'x', createdAt: '2024-01-01T10:00:00.000Z', externalRef: 'c:3' })
    expect(byB.status).toBe(403)
    expect(byB.body.error.code).toBe('NOT_IMPORTED_BY_YOU')
    // A normal (non-imported) expense is off limits too.
    const g2 = await addGuest(app, a, 'G2')
    const plain = (await expense(a, { description: 'x', cost: '4', paid: { kind: 'single', personId: meA.personId }, split: { method: 'equal', personIds: [meA.personId, g2] } })).body.data.id
    const onPlain = await api(app, a).post(`/api/split/expenses/${plain}/comments/import`, { authorPersonId: g2, body: 'x', createdAt: '2024-01-01T10:00:00.000Z', externalRef: 'c:4' })
    expect(onPlain.status).toBe(403)
  })

  it('rejects guests not on the expense, other people\u2019s guests and future dates', async () => {
    const a = await createTestUser(app)
    const c = await createTestUser(app)
    const meA = await me(app, a)
    const g = await addGuest(app, a, 'Sam')
    const outsider = await addGuest(app, a, 'Outsider')
    const cGuest = await addGuest(app, c, 'C guest')
    const id = await imported(a, meA.personId, g)
    const post = (author: string, createdAt = '2024-01-01T10:00:00.000Z', ref = `c:${Math.random()}`) =>
      api(app, a).post(`/api/split/expenses/${id}/comments/import`, { authorPersonId: author, body: 'x', createdAt, externalRef: ref })
    expect((await post(outsider)).body.error.code).toBe('AUTHOR_NOT_INVOLVED')
    expect((await post(cGuest)).status).toBe(403)
    expect((await post(g, new Date(Date.now() + 86_400_000).toISOString())).body.error.code).toBe('INVALID_DATE')
    expect((await post(meA.personId)).status).toBe(200)
  })
})
