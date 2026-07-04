import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthState } from '../lib/auth'
import { getSession, signOut as authSignOut } from '../lib/auth'

type AuthCtx = {
  state: AuthState
  signOut: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const load = async () => {
    const session = await getSession()
    if (session) {
      setState({ status: 'authenticated', user: session.user, session: session.session })
    } else {
      setState({ status: 'unauthenticated' })
    }
  }

  const handleSignOut = async () => {
    await authSignOut()
    setState({ status: 'unauthenticated' })
  }

  useEffect(() => {
    void load()
  }, [])

  const ctx = useMemo<AuthCtx>(() => ({
    state,
    signOut: handleSignOut,
    refetch: load,
  }), [state])

  return (
    <AuthContext.Provider value={ctx}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
