// Stockage LOCAL : les comptes sont enregistrés sur l'appareil (pas de serveur).
export type Status = 'online' | 'idle' | 'dnd' | 'invisible'

export type Profile = {
  id: string
  username: string
  bio: string
  avatar_url: string | null
  status: Status
  name_color: string
  name_font: string
  name_effect: string
}

type Account = Profile & { salt: string; hash: string }

const ACCOUNTS = 'monapp.accounts'
const SESSION = 'monapp.session'

function readAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS) ?? '[]')
  } catch {
    return []
  }
}
const writeAccounts = (a: Account[]) => localStorage.setItem(ACCOUNTS, JSON.stringify(a))

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' },
    key,
    256
  )
  return toHex(bits)
}

const strip = ({ salt: _s, hash: _h, ...profile }: Account): Profile => profile

export async function signUp(username: string, password: string): Promise<Profile> {
  const name = username.trim()
  if (name.length < 3 || name.length > 32) throw new Error('Le pseudo doit faire entre 3 et 32 caractères.')
  if (password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.')
  const accounts = readAccounts()
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase()))
    throw new Error('Ce pseudo est déjà pris sur cet appareil.')
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const account: Account = {
    id: crypto.randomUUID(),
    username: name,
    bio: '',
    avatar_url: null,
    status: 'online',
    name_color: '#ffffff',
    name_font: 'sans',
    name_effect: 'none',
    salt,
    hash: await hashPassword(password, salt),
  }
  writeAccounts([...accounts, account])
  localStorage.setItem(SESSION, account.id)
  return strip(account)
}

export async function signIn(username: string, password: string): Promise<Profile> {
  const account = readAccounts().find((a) => a.username.toLowerCase() === username.trim().toLowerCase())
  if (!account || (await hashPassword(password, account.salt)) !== account.hash)
    throw new Error('Pseudo ou mot de passe incorrect.')
  localStorage.setItem(SESSION, account.id)
  return strip(account)
}

export function signOut() {
  localStorage.removeItem(SESSION)
}

export function currentProfile(): Profile | null {
  const id = localStorage.getItem(SESSION)
  const account = readAccounts().find((a) => a.id === id)
  return account ? strip(account) : null
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): Profile {
  const accounts = readAccounts()
  const i = accounts.findIndex((a) => a.id === id)
  if (i < 0) throw new Error('Compte introuvable.')
  if (patch.username !== undefined) {
    const name = patch.username.trim()
    if (name.length < 3 || name.length > 32) throw new Error('Pseudo : 3 à 32 caractères.')
    if (accounts.some((a, j) => j !== i && a.username.toLowerCase() === name.toLowerCase()))
      throw new Error('Ce pseudo est déjà pris.')
    patch = { ...patch, username: name }
  }
  accounts[i] = { ...accounts[i], ...patch }
  writeAccounts(accounts)
  return strip(accounts[i])
}

// Réduit l'image à 256 px max pour ne pas remplir le stockage
export function imageToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = 256
      const scale = Math.min(1, size / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
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
