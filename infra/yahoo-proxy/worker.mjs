const YAHOO_ORIGIN = 'https://query1.finance.yahoo.com'
const MAX_SEARCH_LENGTH = 100
const MAX_CHART_RANGE_SECONDS = 10 * 366 * 24 * 60 * 60
const UPSTREAM_TIMEOUT_MS = 10_000

function response(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function allowedSourceIps(env) {
  return new Set(String(env.ALLOWED_SOURCE_IPS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))
}

function hasOnly(params, allowed) {
  return [...params.keys()].every((key) => allowed.has(key))
}

function buildSearchUrl(incoming) {
  const allowed = new Set(['q', 'quotesCount', 'newsCount', 'enableFuzzyQuery'])
  if (!hasOnly(incoming.searchParams, allowed)) return null

  const query = incoming.searchParams.get('q')?.trim() ?? ''
  const quotesCount = Number(incoming.searchParams.get('quotesCount') ?? '10')
  const newsCount = incoming.searchParams.get('newsCount') ?? '0'
  const fuzzy = incoming.searchParams.get('enableFuzzyQuery') ?? 'false'
  if (!query || query.length > MAX_SEARCH_LENGTH || !Number.isInteger(quotesCount) || quotesCount < 1 || quotesCount > 25) return null
  if (newsCount !== '0' || fuzzy !== 'false') return null

  const upstream = new URL('/v1/finance/search', YAHOO_ORIGIN)
  upstream.search = new URLSearchParams({
    q: query,
    quotesCount: String(quotesCount),
    newsCount: '0',
    enableFuzzyQuery: 'false',
  }).toString()
  return upstream
}

function buildChartUrl(incoming) {
  const prefix = '/v8/finance/chart/'
  if (!incoming.pathname.startsWith(prefix)) return null

  let symbol
  try {
    symbol = decodeURIComponent(incoming.pathname.slice(prefix.length))
  } catch {
    return null
  }
  if (!/^[A-Za-z0-9.^=_-]{1,32}$/.test(symbol)) return null

  const allowed = new Set(['period1', 'period2', 'interval', 'events'])
  if (!hasOnly(incoming.searchParams, allowed)) return null
  const period1Raw = incoming.searchParams.get('period1') ?? ''
  const period2Raw = incoming.searchParams.get('period2') ?? ''
  if (!/^\d{1,12}$/.test(period1Raw) || !/^\d{1,12}$/.test(period2Raw)) return null
  const period1 = Number(period1Raw)
  const period2 = Number(period2Raw)
  if (period1 <= 0 || period2 <= period1 || period2 - period1 > MAX_CHART_RANGE_SECONDS) return null
  if (incoming.searchParams.get('interval') !== '1d' || incoming.searchParams.get('events') !== 'history') return null

  const upstream = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, YAHOO_ORIGIN)
  upstream.search = new URLSearchParams({ period1: period1Raw, period2: period2Raw, interval: '1d', events: 'history' }).toString()
  return upstream
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  if (request.method !== 'GET') return response('Method not allowed', 405)

  const allowedIps = allowedSourceIps(env)
  if (allowedIps.size === 0) return response('Proxy is not configured', 503)
  if (!allowedIps.has(request.headers.get('CF-Connecting-IP') ?? '')) return response('Forbidden', 403)

  const incoming = new URL(request.url)
  const upstream = incoming.pathname === '/v1/finance/search'
    ? buildSearchUrl(incoming)
    : buildChartUrl(incoming)
  if (!upstream) return response('Not found', 404)

  try {
    const upstreamResponse = await fetchImpl(upstream, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FinanceOS/0.1 (+https://github.com/izzatr/finance-os)',
      },
    })
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/json',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return response('Upstream request failed', 502)
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env)
  },
}
