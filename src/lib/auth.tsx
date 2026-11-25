import { createContext, useContext, useState, useCallback } from 'react'
import * as store from './store'
import type { Profile } from './store'

export type { Profile }

type Ctx = {
  profile: Profile | null
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  signOut: () => void
  update: (patch: Partial<Omit<Profile, 'id'>>) => void
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(() => store.currentProfile())

  const signIn = useCallback(async (u: string, p: string) => setProfile(await store.signIn(u, p)), [])
  const signUp = useCallback(async (u: string, p: string) => setProfile(await store.signUp(u, p)), [])
  const signOut = useCallback(() => {
    store.signOut()
    setProfile(null)
  }, [])
  const update = useCallback(
    (patch: Partial<Omit<Profile, 'id'>>) => {
      if (profile) setProfile(store.updateProfile(profile.id, patch))
    },
    [profile]
  )

  return <AuthContext.Provider value={{ profile, signIn, signUp, signOut, update }}>{children}</AuthContext.Provider>
}
