const YAHOO_ORIGIN = 'https://query1.finance.yahoo.com'

addEventListener('fetch', (event) => event.respondWith(handleRequest(event.request)))

async function handleRequest(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const sourceIp = request.headers.get('CF-Connecting-IP')
  if (sourceIp !== '43.133.134.174') return new Response('Forbidden', { status: 403 })

  const incoming = new URL(request.url)
  const allowedSearch = incoming.pathname === '/v1/finance/search'
  const allowedChart = /^\/v8\/finance\/chart\/[A-Za-z0-9._%=-]+$/.test(incoming.pathname)
  if (!allowedSearch && !allowedChart) return new Response('Not found', { status: 404 })

  const upstream = new URL(`${incoming.pathname}${incoming.search}`, YAHOO_ORIGIN)
  const response = await fetch(upstream, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FinanceOS/0.1 (+https://github.com/izzatr/finance-os)',
    },
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}