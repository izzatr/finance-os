/**
 * Better Auth client wrapper for Finance OS web app
 *
 * Provides hooks and helpers for:
 * - session loading / polling
 * - sign in / sign up / sign out
 * - Google OAuth
 * - API key management (reads current user keys)
 *
 * Uses Better Auth's own REST endpoints under /auth/* rather than a client SDK,
 * since the web app is a separate Vite SPA and shares cookies via credentials:'include'.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export type AuthUser = {
  id: string
  name: string | null
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: string
}

export type AuthSession = {
  id: string
  userId: string
  expiresAt: string
  ipAddress: string | null
  userAgent: string | null
}

export type ApiKey = {
  id: string
  name: string | null
  createdAt: string
  /** only shown once on creation */
  key?: string
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser; session: AuthSession }
  | { status: 'unauthenticated' }

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any)?.error?.message ?? (body as any)?.message ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

// ── Session ──────────────────────────────────────────────────────────────────

export async function getSession(): Promise<{ user: AuthUser; session: AuthSession } | null> {
  try {
    const data = await authFetch<{ user: AuthUser; session: AuthSession }>('/auth/get-session')
    return data
  } catch {
    return null
  }
}

// ── Email/Password ───────────────────────────────────────────────────────────

export async function signUp(payload: { email: string; password: string; name: string }) {
  return authFetch('/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function signIn(payload: { email: string; password: string }) {
  return authFetch('/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/** Starts Google OAuth (Better Auth handles callback) and redirects to the provider's consent screen */
export async function signInWithGoogle(): Promise<void> {
  const data = await authFetch<{ url: string }>('/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: `${window.location.origin}/dashboard`,
    }),
  })
  window.location.href = data.url
}

// ── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut() {
  return authFetch('/auth/sign-out', { method: 'POST' })
}

// ── API Keys ─────────────────────────────────────────────────────────────────

export async function listApiKeys(): Promise<ApiKey[]> {
  return authFetch<ApiKey[]>('/auth/api-key/list')
}

export async function createApiKey(name: string): Promise<ApiKey> {
  return authFetch<ApiKey>('/auth/api-key/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function revokeApiKey(id: string): Promise<void> {
  return authFetch('/auth/api-key/delete', {
    method: 'POST',
    body: JSON.stringify({ keyId: id }),
  })
}
