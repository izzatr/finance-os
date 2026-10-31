/** Postgres unique-constraint violation (code 23505), possibly wrapped by drizzle in .cause. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (code === '23505') return true
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause
  return cause?.code === '23505'
}
