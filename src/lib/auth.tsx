import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from './api'
import type { User } from './api'

type Phase = 'loading' | 'out' | 'in' | 'unreachable'

type Ctx = {
  phase: Phase
  profile: User | null
  retry: () => void
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, signupCode: string) => Promise<void>
  logout: () => Promise<void>
  update: (patch: Parameters<typeof api.updateMe>[0]) => Promise<void>
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>(api.getToken() && api.getServerAddress() ? 'loading' : 'out')
  const [profile, setProfile] = useState<User | null>(null)

  const load = useCallback(async () => {
    if (!api.getToken() || !api.getServerAddress()) return setPhase('out')
    setPhase('loading')
    try {
      setProfile(await api.getMe())
      setPhase('in')
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) {
        api.setToken(null)
        setPhase('out')
      } else setPhase('unreachable')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Signale notre présence toutes les 20 s (et récupère un éventuel changement de session)
  useEffect(() => {
    if (phase !== 'in') return
    const t = setInterval(() => {
      api.getMe().catch((e) => {
        if (e instanceof api.ApiError && e.status === 401) {
          api.setToken(null)
          setProfile(null)
          setPhase('out')
        }
      })
    }, 20000)
    return () => clearInterval(t)
  }, [phase])

  const login = useCallback(async (u: string, p: string) => {
    setProfile(await api.signIn(u, p))
    setPhase('in')
  }, [])
  const register = useCallback(async (u: string, p: string, c: string) => {
    setProfile(await api.signUp(u, p, c))
    setPhase('in')
  }, [])
  const logout = useCallback(async () => {
    await api.signOut()
    setProfile(null)
    setPhase('out')
  }, [])
  const update = useCallback(async (patch: Parameters<typeof api.updateMe>[0]) => {
    setProfile(await api.updateMe(patch))
  }, [])

  return (
    <AuthContext.Provider value={{ phase, profile, retry: () => void load(), login, register, logout, update }}>
      {children}
    </AuthContext.Provider>
  )
}
