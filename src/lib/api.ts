// Client pour parler au serveur MonApp.
export type Status = 'online' | 'idle' | 'dnd' | 'invisible' | 'offline'

export type CustomStatus = { emoji: string; text: string }
export type User = {
  id: string
  username: string
  bio: string
  pronouns: string
  custom_status: CustomStatus | null
  banner_color: string
  avatar_url: string | null
  status: Status
  name_color: string
  name_font: string
  name_effect: string
}
export type ProfileLink = { label: string; url: string }
export type FullProfile = User & { location: string; links: ProfileLink[]; banner_url: string | null; created: number }

export const PERM_LIST = [
  { key: 'administrator', label: 'Administrateur', hint: 'Toutes les permissions, sans exception', group: 'Général' },
  { key: 'manage_server', label: 'Gérer le serveur', hint: 'Nom, icône, description, communauté, code d\'invitation', group: 'Général' },
  { key: 'manage_roles', label: 'Gérer les rôles', hint: 'Créer des rôles et les donner (seulement ceux sous le sien)', group: 'Général' },
  { key: 'manage_channels', label: 'Gérer les salons', hint: 'Créer, modifier, supprimer des salons', group: 'Général' },
  { key: 'manage_messages', label: 'Gérer les messages', hint: 'Supprimer les messages des autres, ignorer le mode lent', group: 'Modération' },
  { key: 'manage_nicknames', label: 'Gérer les surnoms', hint: 'Changer le surnom des autres membres', group: 'Modération' },
  { key: 'kick_members', label: 'Exclure des membres', hint: '', group: 'Modération' },
  { key: 'ban_members', label: 'Bannir des membres', hint: '', group: 'Modération' },
  { key: 'create_invite', label: 'Voir/créer des invitations', hint: '', group: 'Membres' },
  { key: 'change_nickname', label: 'Changer son surnom', hint: '', group: 'Membres' },
  { key: 'send_messages', label: 'Envoyer des messages', hint: '', group: 'Texte' },
  { key: 'attach_files', label: 'Envoyer des images / clips', hint: '', group: 'Texte' },
  { key: 'add_reactions', label: 'Ajouter des réactions', hint: '', group: 'Texte' },
  { key: 'connect', label: 'Rejoindre les salons vocaux', hint: '', group: 'Vocal' },
  { key: 'speak', label: 'Parler', hint: '', group: 'Vocal' },
  { key: 'video', label: 'Activer la caméra', hint: '', group: 'Vocal' },
  { key: 'screen_share', label: "Partager son écran", hint: '', group: 'Vocal' },
  { key: 'use_soundboard', label: 'Utiliser le soundboard', hint: '', group: 'Vocal' },
  { key: 'create_clips', label: 'Enregistrer des clips', hint: '', group: 'Vocal' },
  { key: 'manage_soundboard', label: 'Gérer le soundboard', hint: 'Ajouter / supprimer des sons', group: 'Vocal' },
] as const
export type PermKey = (typeof PERM_LIST)[number]['key']
export type Perms = Partial<Record<PermKey, boolean>>

export type Role = { id: string; name: string; color: string; hoist: boolean; permissions: Perms; rank: number }
export type Member = User & { roles: string[]; nick: string | null; joined: number; isOwner: boolean }
export type Channel = { id: string; name: string; type: 'text' | 'voice'; topic: string; slowmode: number; readonly: boolean }
export type Community = { enabled: boolean; rules: string; welcome: string; requireAccept: boolean; public: boolean }
export type Sound = { id: string; name: string; emoji: string; url: string }
export type VoiceParticipant = {
  userId: string
  muted: boolean
  deafened: boolean
  camera: boolean
  screen: boolean
  screenStreamId: string | null
  recording: boolean
}
export type ServerInfo = {
  id: string
  name: string
  description: string
  icon_url: string | null
  isOwner: boolean
  perms: Perms
  invite: string | null
  channels: Channel[]
  roles: Role[]
  everyone?: { permissions: Perms }
  myRoles: string[]
  nick: string | null
  needsAccept: boolean
  community: Community
  memberCount: number
  voice: Record<string, VoiceParticipant[]>
  sounds: Sound[]
}
export type DiscoverEntry = { id: string; name: string; description: string; icon_url: string | null; memberCount: number; joined: boolean }

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
const fixFull = (u: FullProfile): FullProfile => ({ ...fixUser(u), banner_url: absUrl(u.banner_url) })
const fixServer = (s: ServerInfo): ServerInfo => ({
  ...s,
  icon_url: absUrl(s.icon_url),
  sounds: s.sounds.map((x) => ({ ...x, url: base + x.url })),
})

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

export const getMe = async () => fixFull((await call<{ user: FullProfile }>('GET', '/me')).user)
export type ProfilePatch = Partial<Omit<FullProfile, 'id' | 'avatar_url' | 'banner_url' | 'created'>> & {
  avatar?: string | null
  banner?: string | null
}
export const updateMe = async (patch: ProfilePatch) => fixFull((await call<{ user: FullProfile }>('PATCH', '/me', patch)).user)
export async function getProfile(userId: string, serverId?: string) {
  const r = await call<{ user: FullProfile; member?: Member }>('GET', `/users/${userId}/profile` + (serverId ? `?server=${serverId}` : ''))
  return { user: fixFull(r.user), member: r.member ? fixUser(r.member) : undefined }
}

const srv = async (p: Promise<{ server: ServerInfo }>) => fixServer((await p).server)
const S = (id: string) => `/servers/${id}`
export const listServers = async () => (await call<{ servers: ServerInfo[] }>('GET', '/servers')).servers.map(fixServer)
export const createServer = (name: string) => srv(call('POST', '/servers', { name }))
export const joinServer = (code: string) => srv(call('POST', '/servers/join', { code }))
export const updateServer = (id: string, patch: {
  name?: string; description?: string; icon?: string | null; community?: Partial<Community>; everyone?: { permissions: Perms }
}) => srv(call('PATCH', S(id), patch))
export const deleteServer = (id: string) => call('DELETE', S(id))
export const leaveServer = (id: string) => call('POST', `${S(id)}/leave`)
export const resetInvite = (id: string) => srv(call('POST', `${S(id)}/invite/reset`))
export const transferServer = (id: string, userId: string) => call('POST', `${S(id)}/transfer`, { userId })
export const acceptRules = (id: string) => srv(call('POST', `${S(id)}/accept-rules`))
export const discover = async () =>
  (await call<{ servers: DiscoverEntry[] }>('GET', '/discover')).servers.map((d) => ({ ...d, icon_url: absUrl(d.icon_url) }))
export const joinPublic = (id: string) => srv(call('POST', `${S(id)}/join-public`))

export const createChannel = (id: string, name: string, type: 'text' | 'voice' = 'text', topic = '') =>
  srv(call('POST', `${S(id)}/channels`, { name, type, topic }))
export const updateChannel = (id: string, cid: string, patch: Partial<Pick<Channel, 'name' | 'topic' | 'slowmode' | 'readonly'>>) =>
  srv(call('PATCH', `${S(id)}/channels/${cid}`, patch))
export const deleteChannel = (id: string, cid: string) => srv(call('DELETE', `${S(id)}/channels/${cid}`))

export const createRole = (id: string, role: { name: string; color: string; hoist: boolean; permissions: Perms }) =>
  srv(call('POST', `${S(id)}/roles`, role))
export const updateRole = (id: string, rid: string, patch: Partial<Pick<Role, 'name' | 'color' | 'hoist' | 'permissions'>>) =>
  srv(call('PATCH', `${S(id)}/roles/${rid}`, patch))
export const deleteRole = (id: string, rid: string) => srv(call('DELETE', `${S(id)}/roles/${rid}`))
export const moveRole = (id: string, rid: string, dir: 'up' | 'down') => srv(call('POST', `${S(id)}/roles/${rid}/move`, { dir }))

export const listMembers = async (id: string) => (await call<{ members: Member[] }>('GET', `${S(id)}/members`)).members.map(fixUser)
export const setMemberRoles = (id: string, userId: string, roles: string[]) => call('PUT', `${S(id)}/members/${userId}/roles`, { roles })
export const setNick = (id: string, userId: string, nick: string | null) => call('PATCH', `${S(id)}/members/${userId}`, { nick })
export const kickMember = (id: string, userId: string) => call('DELETE', `${S(id)}/members/${userId}`)
export const banMember = (id: string, userId: string, reason = '') => call('POST', `${S(id)}/members/${userId}/ban`, { reason })
export const listBans = async (id: string) =>
  (await call<{ bans: { userId: string; username: string; reason: string; at: number }[] }>('GET', `${S(id)}/bans`)).bans
export const unban = (id: string, userId: string) => call('DELETE', `${S(id)}/bans/${userId}`)

export const addSound = (id: string, name: string, emoji: string, data: string) => srv(call('POST', `${S(id)}/sounds`, { name, emoji, data }))
export const deleteSound = (id: string, sid: string) => srv(call('DELETE', `${S(id)}/sounds/${sid}`))
export const playSound = (soundId: string) => call('POST', '/voice/sound', { soundId })

export const displayName = (m: { username: string; nick?: string | null }) => m.nick || m.username

// Lit un fichier en data-URL
export const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Fichier illisible.'))
    r.readAsDataURL(file)
  })

// Envoie un clip vidéo (WebM) dans un salon texte
export async function uploadClip(channelId: string, blob: Blob, caption: string) {
  let res: Response
  try {
    res = await fetch(`${base}/api/channels/${channelId}/clips?caption=${encodeURIComponent(caption)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/webm', Authorization: 'Bearer ' + getToken() },
      body: blob,
    })
  } catch {
    throw new NetworkError("Impossible d'envoyer le clip : serveur injoignable.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erreur ' + res.status)
}

// Réduit une image à 128 px pour l'avatar
export function imageToAvatar(file: File, size = 128, jpeg = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(jpeg ? canvas.toDataURL('image/jpeg', 0.8) : canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible.'))
    }
    img.src = url
  })
}

// ---------- Messages ----------
export type Author = Pick<User, 'id' | 'username' | 'avatar_url' | 'name_color' | 'name_font' | 'name_effect'> & { nick: string | null; role_color: string | null }
export type Message = {
  id: string
  channelId: string
  author: Author
  content: string
  image_url: string | null
  clip_url: string | null
  created: number
  reactions: Record<string, string[]>
}
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']

export const fixMessage = (m: Message): Message => ({ ...m, author: fixUser(m.author), image_url: absUrl(m.image_url), clip_url: absUrl(m.clip_url) })

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
export const setVoiceState = (state: Partial<Omit<VoiceParticipant, 'userId'>>) => call('POST', '/voice/state', state)
export const sendSignal = (to: string, data: unknown) => call('POST', '/voice/signal', { to, data })
