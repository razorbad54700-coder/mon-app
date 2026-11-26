// MonApp — serveur (Phase 2). Aucune dépendance : seulement Node.js 18+.
// Lancement : node server.js   (ou double-clic sur lancer-serveur.bat)
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = Number(process.env.PORT) || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(path.join(DATA_DIR, 'sauvegardes'), { recursive: true })
const IMG_DIR = path.join(DATA_DIR, 'images')
fs.mkdirSync(IMG_DIR, { recursive: true })

// ---------- Configuration ----------
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
let config
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
} catch {
  // Premier lancement : on crée un code d'inscription aléatoire
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('')
  config = { codeInscription: code }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// ---------- Stockage (un simple fichier JSON) ----------
const DATA_FILE = path.join(DATA_DIR, 'data.json')
let db = { users: {}, sessions: {}, servers: {} }
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')))
  // sauvegarde automatique à chaque démarrage (une par jour)
  const day = new Date().toISOString().slice(0, 10)
  fs.copyFileSync(DATA_FILE, path.join(DATA_DIR, 'sauvegardes', `data-${day}.json`))
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('Le fichier de données est illisible :', e.message)
    process.exit(1)
  }
}

// Messages : un fichier à part { idDuSalon: [messages...] }
const MSG_FILE = path.join(DATA_DIR, 'messages.json')
let msgs = {}
try {
  msgs = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8'))
  const day = new Date().toISOString().slice(0, 10)
  fs.copyFileSync(MSG_FILE, path.join(DATA_DIR, 'sauvegardes', `messages-${day}.json`))
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('Le fichier des messages est illisible :', e.message)
    process.exit(1)
  }
}

function writeAtomic(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}
let saveTimer = null
let msgTimer = null
function saveNow() {
  writeAtomic(DATA_FILE, db)
  writeAtomic(MSG_FILE, msgs)
}
function save() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    writeAtomic(DATA_FILE, db)
  }, 400)
}
function saveMsgs() {
  if (msgTimer) return
  msgTimer = setTimeout(() => {
    msgTimer = null
    writeAtomic(MSG_FILE, msgs)
  }, 400)
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    saveNow()
    process.exit(0)
  })
}

// ---------- Outils ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const bad = (m) => new HttpError(400, m)
const uid = () => crypto.randomUUID()
const FONTS = ['sans', 'serif', 'mono', 'cursive']
const EFFECTS = ['none', 'glow', 'gradient']
const STATUSES = ['online', 'idle', 'dnd', 'invisible']

function text(v, min, max, label) {
  if (typeof v !== 'string') throw bad(`${label} invalide.`)
  const s = v.trim()
  if (s.length < min || s.length > max) throw bad(`${label} : ${min} à ${max} caractères.`)
  return s
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}
function sameHash(a, b) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

function presence(u) {
  if (Date.now() - (u.lastSeen || 0) > 45000) return 'offline'
  return u.status === 'invisible' ? 'offline' : u.status
}
function pub(u, self) {
  return {
    id: u.id,
    username: u.username,
    bio: u.bio,
    avatar_url: u.avatar ? `/api/avatar/${u.id}?v=${u.avatarV || 0}` : null,
    status: self ? u.status : presence(u),
    name_color: u.name_color,
    name_font: u.name_font,
    name_effect: u.name_effect,
  }
}

const usernameTaken = (name, exceptId) =>
  Object.values(db.users).some((u) => u.id !== exceptId && u.username.toLowerCase() === name.toLowerCase())

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  db.sessions[token] = userId
  save()
  return token
}

function cleanChannelName(v) {
  const s = text(v, 1, 32, 'Nom du salon').toLowerCase().replace(/\s+/g, '-')
  if (!/^[\p{L}\p{N}_-]+$/u.test(s)) throw bad('Nom du salon : lettres, chiffres, - et _ seulement.')
  return s
}

function newInvite() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    code = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('')
  } while (Object.values(db.servers).some((s) => s.invite === code))
  return code
}

const isStaff = (role) => role === 'owner' || role === 'admin'

function serverFor(user, id) {
  const s = db.servers[id]
  if (!s || !s.members[user.id]) throw new HttpError(404, 'Serveur introuvable.')
  return s
}
function serverView(s, user) {
  const role = s.members[user.id]
  return {
    id: s.id,
    name: s.name,
    role,
    invite: isStaff(role) ? s.invite : null,
    channels: s.channels,
    memberCount: Object.keys(s.members).length,
  }
}

// ---------- Temps réel (Server-Sent Events) ----------
const clients = new Set()
function push(c, event, data) {
  try {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch {
    clients.delete(c)
  }
}
function broadcast(server, event, data, extraUsers = []) {
  for (const c of clients) if (server.members[c.userId] || extraUsers.includes(c.userId)) push(c, event, data)
}
setInterval(() => {
  for (const c of clients) {
    const u = db.users[c.userId]
    if (u) u.lastSeen = Date.now() // une connexion ouverte = en ligne
    try {
      c.res.write(': ping\n\n')
    } catch {
      clients.delete(c)
    }
  }
}, 25000)

// ---------- Messages ----------
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']
const MAX_PER_CHANNEL = 5000
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

function findChannelServer(user, cid) {
  for (const s of Object.values(db.servers))
    if (s.members[user.id] && s.channels.some((c) => c.id === cid)) return s
  throw new HttpError(404, 'Salon introuvable.')
}

function msgView(m) {
  const u = db.users[m.author]
  const author = u
    ? (({ id, username, avatar_url, name_color, name_font, name_effect }) => ({ id, username, avatar_url, name_color, name_font, name_effect }))(pub(u, false))
    : { id: m.author, username: 'Ancien membre', avatar_url: null, name_color: '#9a9cb5', name_font: 'sans', name_effect: 'none' }
  return {
    id: m.id, channelId: m.channelId, author, content: m.content,
    image_url: m.image ? `/api/images/${m.image}` : null,
    created: m.created, reactions: m.reactions,
  }
}

function removeImage(name) {
  if (name) fs.unlink(path.join(IMG_DIR, name), () => {})
}
function purgeChannel(cid) {
  const list = msgs[cid]
  if (!list) return
  for (const m of list) removeImage(m.image)
  delete msgs[cid]
  saveMsgs()
}

function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw bad('Image invalide.')
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 900 * 1024) throw bad('Image trop lourde (900 Ko max).')
  const name = `${uid()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  fs.writeFileSync(path.join(IMG_DIR, name), buf)
  return name
}

const sendTimes = new Map()
function sendLimit(userId) {
  const now = Date.now()
  const list = (sendTimes.get(userId) || []).filter((t) => now - t < 5000)
  if (list.length >= 6) throw new HttpError(429, 'Tu écris trop vite, doucement 🙂')
  list.push(now)
  sendTimes.set(userId, list)
}

// ---------- Limite anti-force-brute ----------
const attempts = new Map()
function limit(req) {
  const ip = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || now > a.reset) return void attempts.set(ip, { n: 1, reset: now + 5 * 60 * 1000 })
  if (++a.n > 20) throw new HttpError(429, 'Trop de tentatives, réessaie dans quelques minutes.')
}

// ---------- HTTP ----------
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
  res.end(data)
}

function readBody(req, max = 400 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > max) {
        reject(new HttpError(413, 'Requête trop volumineuse.'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(v && typeof v === 'object' ? v : {})
      } catch {
        reject(bad('JSON invalide.'))
      }
    })
    req.on('error', reject)
  })
}

function authUser(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '')
  const id = m && db.sessions[m[1]]
  const user = id && db.users[id]
  if (!user) throw new HttpError(401, 'Session expirée, reconnecte-toi.')
  user.lastSeen = Date.now()
  return { user, token: m[1] }
}

async function route(req, res) {
  const { pathname: p } = new URL(req.url, 'http://x')
  const method = req.method
  let m

  if (p === '/api/ping' && method === 'GET')
    return send(res, 200, { ok: true, app: 'MonApp', signupCode: Boolean(config.codeInscription) })

  if ((m = /^\/api\/avatar\/([\w-]+)$/.exec(p)) && method === 'GET') {
    const u = db.users[m[1]]
    const a = u && u.avatar && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(u.avatar)
    if (!a) return send(res, 404, { error: 'Pas d\'avatar.' })
    return send(res, 200, Buffer.from(a[2], 'base64'), { 'Content-Type': a[1], 'Cache-Control': 'public, max-age=31536000, immutable' })
  }

  if ((m = /^\/api\/images\/([\w-]+)\.(png|jpg|webp)$/.exec(p)) && method === 'GET') {
    const file = path.join(IMG_DIR, `${m[1]}.${m[2]}`)
    return fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: 'Image introuvable.' })
      send(res, 200, data, { 'Content-Type': IMG_TYPES[m[2]], 'Cache-Control': 'public, max-age=31536000, immutable' })
    })
  }

  if (p === '/api/events' && method === 'GET') {
    const t = new URL(req.url, 'http://x').searchParams.get('token') || ''
    const userId = db.sessions[t]
    if (!userId || !db.users[userId]) throw new HttpError(401, 'Session expirée, reconnecte-toi.')
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write(': connecté\n\n')
    const c = { res, userId }
    clients.add(c)
    db.users[userId].lastSeen = Date.now()
    res.on('close', () => clients.delete(c))
    return
  }

  if (p === '/api/signup' && method === 'POST') {
    limit(req)
    const b = await readBody(req)
    if (config.codeInscription && String(b.signupCode || '').trim().toUpperCase() !== String(config.codeInscription).toUpperCase())
      throw new HttpError(403, "Code d'inscription incorrect.")
    const username = text(b.username, 3, 32, 'Pseudo')
    if (typeof b.password !== 'string' || b.password.length < 6 || b.password.length > 200)
      throw bad('Le mot de passe doit faire au moins 6 caractères.')
    if (usernameTaken(username)) throw new HttpError(409, 'Ce pseudo est déjà pris.')
    const salt = crypto.randomBytes(16).toString('hex')
    const user = {
      id: uid(), username, salt, hash: hash(b.password, salt), bio: '', avatar: null, avatarV: 0,
      status: 'online', name_color: '#ffffff', name_font: 'sans', name_effect: 'none',
      created: Date.now(), lastSeen: Date.now(),
    }
    db.users[user.id] = user
    const token = newSession(user.id)
    save()
    return send(res, 201, { token, user: pub(user, true) })
  }

  if (p === '/api/login' && method === 'POST') {
    limit(req)
    const b = await readBody(req)
    const name = String(b.username || '').trim().toLowerCase()
    const user = Object.values(db.users).find((u) => u.username.toLowerCase() === name)
    if (!user || typeof b.password !== 'string' || !sameHash(hash(b.password, user.salt), user.hash))
      throw new HttpError(401, 'Pseudo ou mot de passe incorrect.')
    user.lastSeen = Date.now()
    return send(res, 200, { token: newSession(user.id), user: pub(user, true) })
  }

  // ----- tout ce qui suit demande d'être connecté -----
  const { user, token } = authUser(req)

  if (p === '/api/logout' && method === 'POST') {
    delete db.sessions[token]
    save()
    return send(res, 200, { ok: true })
  }

  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: pub(user, true) })

  if (p === '/api/me' && method === 'PATCH') {
    const b = await readBody(req)
    if (b.username !== undefined) {
      const name = text(b.username, 3, 32, 'Pseudo')
      if (usernameTaken(name, user.id)) throw new HttpError(409, 'Ce pseudo est déjà pris.')
      user.username = name
    }
    if (b.bio !== undefined) {
      if (typeof b.bio !== 'string' || b.bio.length > 190) throw bad('Bio : 190 caractères max.')
      user.bio = b.bio
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw bad('Statut invalide.')
      user.status = b.status
    }
    if (b.name_color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(b.name_color)) throw bad('Couleur invalide.')
      user.name_color = b.name_color
    }
    if (b.name_font !== undefined) {
      if (!FONTS.includes(b.name_font)) throw bad('Police invalide.')
      user.name_font = b.name_font
    }
    if (b.name_effect !== undefined) {
      if (!EFFECTS.includes(b.name_effect)) throw bad('Effet invalide.')
      user.name_effect = b.name_effect
    }
    if (b.avatar !== undefined) {
      if (b.avatar === null) user.avatar = null
      else if (typeof b.avatar === 'string' && b.avatar.length <= 250000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatar))
        user.avatar = b.avatar
      else throw bad('Avatar invalide ou trop lourd.')
      user.avatarV = (user.avatarV || 0) + 1
    }
    save()
    return send(res, 200, { user: pub(user, true) })
  }

  if (p === '/api/servers' && method === 'GET') {
    const list = Object.values(db.servers).filter((s) => s.members[user.id]).map((s) => serverView(s, user))
    return send(res, 200, { servers: list })
  }

  if (p === '/api/servers' && method === 'POST') {
    const b = await readBody(req)
    const name = text(b.name, 2, 40, 'Nom du serveur')
    if (Object.values(db.servers).filter((s) => s.owner === user.id).length >= 10) throw bad('Maximum 10 serveurs par personne.')
    const s = {
      id: uid(), name, owner: user.id, invite: newInvite(), created: Date.now(),
      channels: [{ id: uid(), name: 'général' }],
      members: { [user.id]: 'owner' },
    }
    db.servers[s.id] = s
    save()
    return send(res, 201, { server: serverView(s, user) })
  }

  if (p === '/api/servers/join' && method === 'POST') {
    const b = await readBody(req)
    const code = String(b.code || '').trim().toUpperCase()
    const s = Object.values(db.servers).find((x) => x.invite === code)
    if (!s) throw new HttpError(404, "Code d'invitation invalide.")
    if (!s.members[user.id]) {
      if (Object.keys(s.members).length >= 500) throw bad('Ce serveur est plein.')
      s.members[user.id] = 'member'
      save()
      broadcast(s, 'refresh', {})
    }
    return send(res, 200, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)$/.exec(p))) {
    const s = serverFor(user, m[1])
    const role = s.members[user.id]
    if (method === 'PATCH') {
      if (role !== 'owner') throw new HttpError(403, 'Réservé au propriétaire.')
      const b = await readBody(req)
      s.name = text(b.name, 2, 40, 'Nom du serveur')
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }
    if (method === 'DELETE') {
      if (role !== 'owner') throw new HttpError(403, 'Réservé au propriétaire.')
      for (const c of s.channels) purgeChannel(c.id)
      broadcast(s, 'refresh', {})
      delete db.servers[s.id]
      save()
      return send(res, 200, { ok: true })
    }
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members$/.exec(p)) && method === 'GET') {
    const s = serverFor(user, m[1])
    const members = Object.entries(s.members)
      .filter(([id]) => db.users[id])
      .map(([id, role]) => ({ ...pub(db.users[id], id === user.id), role }))
    return send(res, 200, { members })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/leave$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (s.members[user.id] === 'owner') throw bad('Le propriétaire ne peut pas quitter : supprime le serveur à la place.')
    delete s.members[user.id]
    save()
    broadcast(s, 'refresh', {}, [user.id])
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/invite\/reset$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (!isStaff(s.members[user.id])) throw new HttpError(403, 'Réservé aux admins.')
    s.invite = newInvite()
    save()
    return send(res, 200, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/channels$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (!isStaff(s.members[user.id])) throw new HttpError(403, 'Réservé aux admins.')
    const b = await readBody(req)
    if (s.channels.length >= 50) throw bad('Maximum 50 salons.')
    s.channels.push({ id: uid(), name: cleanChannelName(b.name) })
    save()
    broadcast(s, 'refresh', {})
    return send(res, 201, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/channels\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = serverFor(user, m[1])
    if (!isStaff(s.members[user.id])) throw new HttpError(403, 'Réservé aux admins.')
    if (s.channels.length <= 1) throw bad('Un serveur doit garder au moins un salon.')
    s.channels = s.channels.filter((c) => c.id !== m[2])
    purgeChannel(m[2])
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members\/([\w-]+)\/role$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (s.members[user.id] !== 'owner') throw new HttpError(403, 'Réservé au propriétaire.')
    const b = await readBody(req)
    if (!['admin', 'member'].includes(b.role)) throw bad('Rôle invalide.')
    if (!s.members[m[2]] || s.members[m[2]] === 'owner') throw bad('Membre invalide.')
    s.members[m[2]] = b.role
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = serverFor(user, m[1])
    const mine = s.members[user.id]
    const theirs = s.members[m[2]]
    if (!isStaff(mine)) throw new HttpError(403, 'Réservé aux admins.')
    if (!theirs || m[2] === user.id || theirs === 'owner') throw bad('Impossible d\'exclure ce membre.')
    if (mine === 'admin' && theirs !== 'member') throw new HttpError(403, 'Un admin ne peut exclure que des membres.')
    delete s.members[m[2]]
    save()
    broadcast(s, 'refresh', {}, [m[2]])
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/messages$/.exec(p))) {
    const s = findChannelServer(user, m[1])
    const cid = m[1]
    if (method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams
      const list = msgs[cid] || []
      let end = list.length
      const before = q.get('before')
      if (before) {
        const i = list.findIndex((x) => x.id === before)
        if (i >= 0) end = i
      }
      const start = Math.max(0, end - 50)
      return send(res, 200, { messages: list.slice(start, end).map(msgView), hasMore: start > 0 })
    }
    if (method === 'POST') {
      const b = await readBody(req, 1200 * 1024)
      sendLimit(user.id)
      const content = typeof b.content === 'string' ? b.content.trim() : ''
      if (content.length > 2000) throw bad('Message trop long (2000 caractères max).')
      if (!content && !b.image) throw bad('Message vide.')
      const image = b.image ? saveImage(String(b.image)) : null
      const list = (msgs[cid] = msgs[cid] || [])
      const msg = { id: uid(), channelId: cid, author: user.id, content, image, created: Date.now(), reactions: {} }
      list.push(msg)
      while (list.length > MAX_PER_CHANNEL) removeImage(list.shift().image)
      saveMsgs()
      const view = msgView(msg)
      broadcast(s, 'message', view)
      return send(res, 201, { message: view })
    }
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/messages\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = findChannelServer(user, m[1])
    const list = msgs[m[1]] || []
    const i = list.findIndex((x) => x.id === m[2])
    if (i < 0) throw new HttpError(404, 'Message introuvable.')
    const msg = list[i]
    const staff = isStaff(s.members[user.id])
    if (msg.author !== user.id && !(staff && s.members[msg.author] !== 'owner'))
      throw new HttpError(403, 'Tu ne peux pas supprimer ce message.')
    list.splice(i, 1)
    removeImage(msg.image)
    saveMsgs()
    broadcast(s, 'message_deleted', { channelId: m[1], id: m[2] })
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/messages\/([\w-]+)\/reactions$/.exec(p)) && method === 'PUT') {
    const s = findChannelServer(user, m[1])
    const b = await readBody(req)
    if (!EMOJIS.includes(b.emoji)) throw bad('Emoji non autorisé.')
    const msg = (msgs[m[1]] || []).find((x) => x.id === m[2])
    if (!msg) throw new HttpError(404, 'Message introuvable.')
    const users = msg.reactions[b.emoji] || []
    const i = users.indexOf(user.id)
    if (i >= 0) users.splice(i, 1)
    else users.push(user.id)
    if (users.length) msg.reactions[b.emoji] = users
    else delete msg.reactions[b.emoji]
    saveMsgs()
    broadcast(s, 'reaction', { channelId: m[1], id: m[2], reactions: msg.reactions })
    return send(res, 200, { ok: true })
  }

  throw new HttpError(404, 'Route inconnue.')
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  try {
    await route(req, res)
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message })
    else {
      console.error(e)
      send(res, 500, { error: 'Erreur du serveur.' })
    }
  }
})

server.listen(PORT, () => {
  console.log('==============================================')
  console.log('  MonApp — serveur démarré')
  console.log(`  Port            : ${PORT}`)
  console.log(`  Données         : ${DATA_DIR}`)
  console.log('  Version         : Phase 3 (messages)')
  console.log(`  Code d'inscription : ${config.codeInscription || '(aucun)'}`)
  console.log(`  Adresse locale  : http://localhost:${PORT}`)
  console.log('  Laisse cette fenêtre ouverte. Ctrl+C pour arrêter.')
  console.log('==============================================')
})
