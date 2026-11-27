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
export type Channel = { id: string; name: string; type?: 'text' | 'voice' }
export type VoiceParticipant = { userId: string; muted: boolean; deafened: boolean; camera: boolean }
export type ServerInfo = {
  id: string
  name: string
  role: Role
  invite: string | null
  channels: Channel[]
  memberCount: number
  voice: Record<string, VoiceParticipant[]>
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
const fixUser = <T extends { avatar_url: string | null }>(u: T): T => ({ ...u, avatar_url: absUrl(u.avatar_url) })

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
export const createChannel = (id: string, name: string, type: 'text' | 'voice' = 'text') =>
  call('POST', `/servers/${id}/channels`, { name, type })
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

// ---------- Messages ----------
export type Author = Pick<User, 'id' | 'username' | 'avatar_url' | 'name_color' | 'name_font' | 'name_effect'>
export type Message = {
  id: string
  channelId: string
  author: Author
  content: string
  image_url: string | null
  created: number
  reactions: Record<string, string[]>
}
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']

export const fixMessage = (m: Message): Message => ({ ...m, author: fixUser(m.author), image_url: absUrl(m.image_url) })

export async function listMessages(channelId: string, before?: string) {
  const r = await call<{ messages: Message[]; hasMore: boolean }>(
    'GET',
    `/channels/${channelId}/messages` + (before ? `?before=${encodeURIComponent(before)}` : '')
  )
  return { messages: r.messages.map(fixMessage), hasMore: r.hasMore }
}
export async function sendMessage(channelId: string, content: string, image: string | null) {
  const r = await call<{ message: Message }>('POST', `/channels/${channelId}/messages`, { content, image })
  return fixMessage(r.message)
}
export const deleteMessage = (channelId: string, messageId: string) =>
  call('DELETE', `/channels/${channelId}/messages/${messageId}`)
export const toggleReaction = (channelId: string, messageId: string, emoji: string) =>
  call('PUT', `/channels/${channelId}/messages/${messageId}/reactions`, { emoji })

// Réduit une photo à 1280 px max (JPEG) pour l'envoyer dans un message
export function imageToUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      let quality = 0.82
      let data = canvas.toDataURL('image/jpeg', quality)
      while (data.length * 0.75 > 800 * 1024 && quality > 0.3) {
        quality -= 0.15
        data = canvas.toDataURL('image/jpeg', quality)
      }
      if (data.length * 0.75 > 800 * 1024) reject(new Error('Image trop lourde.'))
      else resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible.'))
    }
    img.src = url
  })
}

// ---------- Vocal ----------
export const getIce = async () => (await call<{ iceServers: RTCIceServer[] }>('GET', '/ice')).iceServers
export const joinVoiceChannel = async (channelId: string) =>
  (await call<{ participants: VoiceParticipant[] }>('POST', `/voice/${channelId}/join`)).participants
export const leaveVoiceChannel = () => call('POST', '/voice/leave')
export const setVoiceState = (state: { muted: boolean; deafened: boolean; camera: boolean }) =>
  call('POST', '/voice/state', state)
export const sendSignal = (to: string, data: unknown) => call('POST', '/voice/signal', { to, data })
