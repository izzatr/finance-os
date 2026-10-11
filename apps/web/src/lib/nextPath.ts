/** A same-site path from ?next=, or null. Rejects absolute and protocol-relative URLs. */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}
