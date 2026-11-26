// Client pour parler au serveur MonApp.
export type Status = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'
export type Role = 'owner' | 'admin' | 'member'

export type User = {
  id: string
  username: string
  bio: string
  avatar_url: string | null
  status: Status
  name_color: string
  name_font: string
  name_effect: string
}
export type Member = User & { role: Role }
export type Channel = { id: string; name: string }
export type ServerInfo = {
  id: string
  name: string
  role: Role
  invite: string | null
  channels: Channel[]
  memberCount: number
}

const K_SERVER = 'monapp.server'
const K_TOKEN = 'monapp.token'

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* stockage indisponible */
  }
}

export function normalizeAddress(input: string): string {
  let a = input.trim().replace(/\/+$/, '')
  if (!a) return ''
  if (!/^https?:\/\//i.test(a)) a = 'http://' + a
  return a
}

let base = read(K_SERVER)
export const getServerAddress = () => base
export function setServerAddress(address: string) {
  base = normalizeAddress(address)
  write(K_SERVER, base)
}

export const getToken = () => read(K_TOKEN)
export const setToken = (t: string | null) => write(K_TOKEN, t)

export const absUrl = (u: string | null): string | null => (u ? base + u : null)
const fixUser = <T extends User>(u: T): T => ({ ...u, avatar_url: absUrl(u.avatar_url) })

export class NetworkError extends Error {}
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  if (!base) throw new NetworkError("Aucune adresse de serveur n'est configurée.")
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = 'Bearer ' + token
  let res: Response
  try {
    res = await fetch(base + '/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError('Impossible de joindre le serveur. Est-il allumé ? L\'adresse est-elle bonne ?')
  }
  let data: { error?: string } = {}
  try {
    data = await res.json()
  } catch {
    /* pas de JSON */
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erreur ' + res.status)
  return data as T
}

export async function ping(address: string): Promise<{ signupCode: boolean }> {
  const target = normalizeAddress(address)
  let res: Response
  try {
    res = await fetch(target + '/api/ping')
  } catch {
    throw new NetworkError('Impossible de joindre ce serveur. Vérifie l\'adresse et qu\'il est bien lancé.')
  }
  const data = await res.json().catch(() => null)
  if (!data || data.app !== 'MonApp') throw new NetworkError("Cette adresse n'est pas un serveur MonApp.")
  return data
}

export async function signUp(username: string, password: string, signupCode: string) {
  const r = await call<{ token: string; user: User }>('POST', '/signup', { username, password, signupCode }, false)
  setToken(r.token)
  return fixUser(r.user)
}
export async function signIn(username: string, password: string) {
  const r = await call<{ token: string; user: User }>('POST', '/login', { username, password }, false)
  setToken(r.token)
  return fixUser(r.user)
}
export async function signOut() {
  try {
    await call('POST', '/logout')
  } catch {
    /* peu importe */
  }
  setToken(null)
}

export const getMe = async () => fixUser((await call<{ user: User }>('GET', '/me')).user)
export const updateMe = async (patch: Partial<Omit<User, 'id' | 'avatar_url'>> & { avatar?: string | null }) =>
  fixUser((await call<{ user: User }>('PATCH', '/me', patch)).user)

export const listServers = async () => (await call<{ servers: ServerInfo[] }>('GET', '/servers')).servers
export const createServer = async (name: string) => (await call<{ server: ServerInfo }>('POST', '/servers', { name })).server
export const joinServer = async (code: string) => (await call<{ server: ServerInfo }>('POST', '/servers/join', { code })).server
export const renameServer = (id: string, name: string) => call('PATCH', `/servers/${id}`, { name })
export const deleteServer = (id: string) => call('DELETE', `/servers/${id}`)
export const leaveServer = (id: string) => call('POST', `/servers/${id}/leave`)
export const resetInvite = (id: string) => call('POST', `/servers/${id}/invite/reset`)
export const createChannel = (id: string, name: string) => call('POST', `/servers/${id}/channels`, { name })
export const deleteChannel = (id: string, channelId: string) => call('DELETE', `/servers/${id}/channels/${channelId}`)
export const listMembers = async (id: string) =>
  (await call<{ members: Member[] }>('GET', `/servers/${id}/members`)).members.map((m) => fixUser(m))
export const setRole = (id: string, userId: string, role: 'admin' | 'member') =>
  call('POST', `/servers/${id}/members/${userId}/role`, { role })
export const kickMember = (id: string, userId: string) => call('DELETE', `/servers/${id}/members/${userId}`)

// Réduit une image à 128 px pour l'avatar
export function imageToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = 128
      const scale = Math.min(1, size / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible.'))
    }
    img.src = url
  })
}
