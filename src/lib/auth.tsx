import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { login as loginRequest, logout as logoutRequest } from '../api/gen/kolearn'
import type { CurrentUser } from '../api/gen/model'
import { refreshSessionOnce, setAccessToken, setSessionLostHandler } from './http'

/**
 * Session state for the UI. The access token itself is deliberately not here —
 * it lives in the http module, in a plain variable, so no React tree, devtools
 * snapshot, or serialised state ever carries it.
 *
 * kolearn-web's `signUp` is absent, along with `/auth/register` from the spec.
 * An admin account is provisioned with a role; a console that lets a visitor
 * create their own account is not an admin console.
 */
type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: CurrentUser | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<CurrentUser | null>(null)

  const clear = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  // A reload starts with no access token by design. The refresh cookie is what
  // survives, so the app replays it once on boot: that is the difference
  // between "reload logs you out" and "reload is invisible", without ever
  // putting a token somewhere script can read.
  useEffect(() => {
    let cancelled = false
    // Through the shared single-flight, not the generated client: a route
    // loader on a deep link can 401 and refresh at the same moment, and two
    // rotations of one refresh token look like theft to the server.
    refreshSessionOnce()
      .then((tokens) => {
        if (cancelled) return
        if (!tokens) {
          clear()
          return
        }
        setUser(tokens.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) clear()
      })
    return () => {
      cancelled = true
    }
  }, [clear])

  // http.ts calls this when a refresh fails mid-session.
  useEffect(() => {
    setSessionLostHandler(clear)
    return () => setSessionLostHandler(() => {})
  }, [clear])

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await loginRequest({ email, password })
    setAccessToken(tokens.accessToken)
    setUser(tokens.user)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // The server may already consider the session gone. Either way the
      // learner asked to be signed out, so the local state goes regardless.
    }
    clear()
  }, [clear])

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
