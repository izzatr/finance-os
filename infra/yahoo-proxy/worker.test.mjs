import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest } from './worker.mjs'

const env = { ALLOWED_SOURCE_IPS: '43.133.134.174,2001:db8::1' }
const headers = { 'CF-Connecting-IP': '43.133.134.174' }

function request(path, init = {}) {
  return new Request(`https://proxy.example.test${path}`, { headers, ...init })
}

test('rejects unauthorized callers and unsafe methods', async () => {
  assert.equal((await handleRequest(new Request('https://proxy.example.test/v1/finance/search?q=AAPL', { headers: { 'CF-Connecting-IP': '203.0.113.1' } }), env)).status, 403)
  assert.equal((await handleRequest(request('/v1/finance/search?q=AAPL', { method: 'POST' }), env)).status, 405)
  assert.equal((await handleRequest(request('/v1/finance/search?q=AAPL'), {}, () => { throw new Error('must not fetch') })).status, 503)
})

test('normalizes the search query and rejects unsupported parameters', async () => {
  let calledUrl
  const fetchImpl = async (url) => {
    calledUrl = String(url)
    return new Response('{"quotes":[]}', { headers: { 'Content-Type': 'application/json' } })
  }
  const ok = await handleRequest(request('/v1/finance/search?q=Bank%20%26%20ETF&quotesCount=12&newsCount=0&enableFuzzyQuery=false'), env, fetchImpl)
  assert.equal(ok.status, 200)
  assert.equal(calledUrl, 'https://query1.finance.yahoo.com/v1/finance/search?q=Bank+%26+ETF&quotesCount=12&newsCount=0&enableFuzzyQuery=false')

  assert.equal((await handleRequest(request('/v1/finance/search?q=AAPL&quotesCount=100&newsCount=0&enableFuzzyQuery=false'), env, fetchImpl)).status, 404)
  assert.equal((await handleRequest(request('/v1/finance/search?q=AAPL&redirect=https://example.com'), env, fetchImpl)).status, 404)
})

test('normalizes chart symbols and bounds history ranges', async () => {
  let calledUrl
  const fetchImpl = async (url) => {
    calledUrl = String(url)
    return new Response('{"chart":{"result":[]}}', { headers: { 'Content-Type': 'application/json' } })
  }
  const ok = await handleRequest(request('/v8/finance/chart/BRK-B?period1=1700000000&period2=1700864000&interval=1d&events=history'), env, fetchImpl)
  assert.equal(ok.status, 200)
  assert.equal(calledUrl, 'https://query1.finance.yahoo.com/v8/finance/chart/BRK-B?period1=1700000000&period2=1700864000&interval=1d&events=history')

  assert.equal((await handleRequest(request('/v8/finance/chart/AAPL%2F..%2Fsecret?period1=1700000000&period2=1700864000&interval=1d&events=history'), env, fetchImpl)).status, 404)
  assert.equal((await handleRequest(request('/v8/finance/chart/AAPL?period1=1&period2=999999999999&interval=1d&events=history'), env, fetchImpl)).status, 404)
})

test('returns a generic 502 when Yahoo cannot be reached', async () => {
  const result = await handleRequest(request('/v1/finance/search?q=AAPL&quotesCount=10&newsCount=0&enableFuzzyQuery=false'), env, async () => { throw new Error('network detail') })
  assert.equal(result.status, 502)
  assert.equal(await result.text(), 'Upstream request failed')
})
