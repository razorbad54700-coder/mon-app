// MonApp — serveur (Phase 7). Aucune dépendance : seulement Node.js 18+.
// Lancement : node server.js   (ou double-clic sur lancer-serveur.bat)
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PORT = Number(process.env.PORT) || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const dir = (name) => {
  const d = path.join(DATA_DIR, name)
  fs.mkdirSync(d, { recursive: true })
  return d
}
dir('sauvegardes')
const IMG_DIR = dir('images')
const CLIP_DIR = dir('clips')
const SOUND_DIR = dir('sons')

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

// ---------- Stockage (de simples fichiers JSON) ----------
const DATA_FILE = path.join(DATA_DIR, 'data.json')
const MSG_FILE = path.join(DATA_DIR, 'messages.json')
const day = new Date().toISOString().slice(0, 10)

function load(file, fallback, label) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))
    fs.copyFileSync(file, path.join(DATA_DIR, 'sauvegardes', `${path.basename(file, '.json')}-${day}.json`))
    return v
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Le fichier ${label} est illisible :`, e.message)
      process.exit(1)
    }
    return fallback
  }
}
const db = Object.assign({ users: {}, sessions: {}, servers: {} }, load(DATA_FILE, {}, 'de données'))
const msgs = load(MSG_FILE, {}, 'des messages') // { idDuSalon: [messages...] }

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
const forbidden = (m = "Tu n'as pas la permission de faire ça.") => new HttpError(403, m)
const uid = () => crypto.randomUUID()
const FONTS = ['sans', 'serif', 'mono', 'cursive']
const EFFECTS = ['none', 'glow', 'gradient']
const STATUSES = ['online', 'idle', 'dnd', 'invisible']
const HEX = /^#[0-9a-fA-F]{6}$/
const cpLen = (s) => [...s].length

// Caractères interdits : invisibles ou de contrôle (ils permettent d'usurper l'identité de quelqu'un).
// Tout le reste est autorisé : lettres de toutes les langues, emojis, symboles, espaces...
const INVISIBLE = /[\p{Cc}­​‌‎‏‪-‮⁠-⁤⁦-⁩﻿\p{Zl}\p{Zp}]/u
function name(v, min, max, label) {
  if (typeof v !== 'string') throw bad(`${label} invalide.`)
  const s = v.normalize('NFC').trim()
  const n = cpLen(s)
  if (n < min || n > max) throw bad(`${label} : ${min} à ${max} caractères.`)
  if (INVISIBLE.test(s)) throw bad(`${label} : caractères invisibles ou de contrôle interdits.`)
  return s
}
const nameKey = (s) => s.normalize('NFKC').toLowerCase()
function freeText(v, max, label) {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw bad(`${label} invalide.`)
  const s = v.replace(/\r\n/g, '\n').trim()
  if (cpLen(s) > max) throw bad(`${label} : ${max} caractères max.`)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) throw bad(`${label} : caractères interdits.`)
  return s
}
function dataUrl(v, types, maxBytes, label) {
  const m = new RegExp(`^data:(${types.join('|')});base64,([A-Za-z0-9+/=]+)$`).exec(String(v))
  if (!m) throw bad(`${label} invalide.`)
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > maxBytes) throw bad(`${label} trop lourd (${Math.round(maxBytes / 1024)} Ko max).`)
  return { mime: m[1], buf }
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}
function sameHash(a, b) {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// ---------- Utilisateurs ----------
function presence(u) {
  if (Date.now() - (u.lastSeen || 0) > 45000) return 'offline'
  return u.status === 'invisible' ? 'offline' : u.status
}
function pub(u, self) {
  return {
    id: u.id,
    username: u.username,
    bio: u.bio,
    pronouns: u.pronouns || '',
    custom_status: u.custom_status || null,
    banner_color: u.banner_color || '',
    avatar_url: u.avatar ? `/api/avatar/${u.id}?v=${u.avatarV || 0}` : null,
    status: self ? u.status : presence(u),
    name_color: u.name_color,
    name_font: u.name_font,
    name_effect: u.name_effect,
    frame: u.equipped?.frame || null,
    name_fx: u.equipped?.name_fx || null,
    title: SHOP_BY[u.equipped?.title]?.value || null,
  }
}
const fullProfile = (u, self) => ({
  ...pub(u, self),
  location: u.location || '',
  links: u.links || [],
  banner_url: u.banner ? `/api/banner/${u.id}?v=${u.bannerV || 0}` : null,
  created: u.created,
  banner_fx: u.equipped?.banner_fx || null,
  badges: (u.badges || []).map((b) => b.id),
})
const usernameTaken = (n, exceptId) =>
  Object.values(db.users).some((u) => u.id !== exceptId && nameKey(u.username) === nameKey(n))

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  db.sessions[token] = userId
  save()
  return token
}

// ---------- Permissions et rôles ----------
const PERMS = [
  'administrator', 'manage_server', 'manage_roles', 'manage_channels', 'manage_messages', 'manage_nicknames',
  'manage_soundboard', 'kick_members', 'ban_members', 'create_invite', 'send_messages', 'attach_files',
  'add_reactions', 'change_nickname', 'connect', 'speak', 'video', 'screen_share', 'use_soundboard', 'create_clips',
]
const ALL = Object.fromEntries(PERMS.map((p) => [p, true]))
const DEFAULT_EVERYONE = {
  create_invite: true, send_messages: true, attach_files: true, add_reactions: true, change_nickname: true,
  connect: true, speak: true, video: true, screen_share: true, use_soundboard: true, create_clips: true,
}
function cleanPerms(obj) {
  const out = {}
  for (const p of PERMS) if (obj && obj[p] === true) out[p] = true
  return out
}

const mkChannel = (n, type, topic = '') => ({ id: uid(), name: n, type, topic, slowmode: 0, readonly: false })
const newMember = (accepted) => ({ roles: [], nick: null, joined: Date.now(), accepted })

function newInvite() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    code = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('')
  } while (Object.values(db.servers).some((s) => s.invite === code))
  return code
}

function newServer(ownerId, serverName) {
  return {
    id: uid(), name: serverName, owner: ownerId, invite: newInvite(), created: Date.now(),
    description: '', icon: null, iconV: 0,
    community: { enabled: false, rules: '', welcome: '', requireAccept: false, public: false },
    everyone: { permissions: { ...DEFAULT_EVERYONE } },
    roles: [], // du plus haut au plus bas
    channels: [mkChannel('général', 'text'), mkChannel('vocal', 'voice')],
    members: { [ownerId]: newMember(true) },
    bans: {},
    sounds: [],
  }
}

// Met à jour les serveurs créés avec une ancienne version (rôles « owner / admin / member »)
function migrate() {
  let changed = false
  for (const s of Object.values(db.servers)) {
    s.description ??= ''
    s.icon ??= null
    s.iconV ??= 0
    s.community ??= { enabled: false, rules: '', welcome: '', requireAccept: false, public: false }
    s.everyone ??= { permissions: { ...DEFAULT_EVERYONE } }
    s.roles ??= []
    s.bans ??= {}
    s.sounds ??= []
    let adminRole = null
    for (const [id, v] of Object.entries(s.members)) {
      if (typeof v !== 'string') continue
      changed = true
      const mem = newMember(true)
      mem.joined = s.created
      if (v === 'admin') {
        if (!adminRole) {
          adminRole = {
            id: uid(), name: 'Admin', color: '#f0b232', hoist: true,
            permissions: cleanPerms({ manage_channels: true, manage_messages: true, manage_nicknames: true, manage_soundboard: true, kick_members: true, ban_members: true, create_invite: true }),
          }
          s.roles.push(adminRole)
        }
        mem.roles = [adminRole.id]
      }
      s.members[id] = mem
    }
    for (const c of s.channels) {
      c.type ??= 'text'
      c.topic ??= ''
      c.slowmode ??= 0
      c.readonly ??= false
    }
  }
  if (changed) save()
}
migrate()

function permsOf(s, userId) {
  if (s.owner === userId) return { ...ALL }
  const m = s.members[userId]
  if (!m) return {}
  const p = { ...s.everyone.permissions }
  for (const rid of m.roles) {
    const r = s.roles.find((x) => x.id === rid)
    if (r) Object.assign(p, r.permissions)
  }
  return p.administrator ? { ...ALL } : p
}
const has = (s, userId, perm) => Boolean(permsOf(s, userId)[perm])
function need(s, user, perm) {
  if (!has(s, user.id, perm)) throw forbidden()
}
const rankOf = (s, rid) => {
  const i = s.roles.findIndex((r) => r.id === rid)
  return i < 0 ? 0 : s.roles.length - i
}
function topRank(s, userId) {
  if (s.owner === userId) return Infinity
  const m = s.members[userId]
  return m ? Math.max(0, ...m.roles.map((r) => rankOf(s, r))) : 0
}
function canActOn(s, actorId, targetId) {
  if (targetId === s.owner) return false
  if (s.owner === actorId) return true
  return topRank(s, actorId) > topRank(s, targetId)
}
function roleColor(s, userId) {
  const m = s.members[userId]
  if (!m) return null
  const r = s.roles.filter((x) => m.roles.includes(x.id) && x.color).sort((a, b) => rankOf(s, b.id) - rankOf(s, a.id))[0]
  return r ? r.color : null
}
// On ne peut pas donner une permission qu'on n'a pas soi-même
function checkGrant(s, user, perms) {
  const mine = permsOf(s, user.id)
  for (const p of Object.keys(perms)) if (!mine[p]) throw forbidden(`Tu ne peux pas donner la permission « ${p} » : tu ne l'as pas toi-même.`)
}

function serverFor(user, id) {
  const s = db.servers[id]
  if (!s || !s.members[user.id]) throw new HttpError(404, 'Serveur introuvable.')
  return s
}
const needsAccept = (s, userId) =>
  s.owner !== userId && s.community.enabled && s.community.requireAccept && !s.members[userId].accepted
function requireAccepted(s, user) {
  if (needsAccept(s, user.id)) throw forbidden("Accepte d'abord le règlement du serveur.")
}

function serverView(s, user) {
  const perms = permsOf(s, user.id)
  const m = s.members[user.id]
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    icon_url: s.icon ? `/api/server-icon/${s.id}?v=${s.iconV}` : null,
    isOwner: s.owner === user.id,
    perms,
    invite: perms.create_invite ? s.invite : null,
    channels: s.channels,
    roles: s.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, permissions: r.permissions, rank: rankOf(s, r.id) })),
    everyone: perms.manage_roles || perms.manage_server ? s.everyone : undefined,
    myRoles: m.roles,
    nick: m.nick,
    needsAccept: needsAccept(s, user.id),
    community: s.community,
    memberCount: Object.keys(s.members).length,
    voice: Object.fromEntries(s.channels.filter((c) => voice[c.id]).map((c) => [c.id, voiceView(c.id)])),
    sounds: s.sounds.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, url: `/api/sounds/${x.file}` })),
  }
}
function memberView(s, id, viewerId) {
  const u = db.users[id]
  const m = s.members[id]
  return { ...pub(u, id === viewerId), roles: m.roles, nick: m.nick, joined: m.joined, isOwner: s.owner === id }
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

// ---------- Fichiers (images, clips, sons) ----------
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const SOUND_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm' }
const SOUND_MIME = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' }
const removeFile = (folder, file) => {
  if (file) fs.unlink(path.join(folder, file), () => {})
}
function saveImage(value) {
  const { mime, buf } = dataUrl(value, ['image/png', 'image/jpeg', 'image/webp'], 900 * 1024, 'Image')
  const file = `${uid()}.${MIME_EXT[mime]}`
  fs.writeFileSync(path.join(IMG_DIR, file), buf)
  return file
}

// ---------- Messages ----------
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']
const MAX_PER_CHANNEL = 5000

function findChannelServer(user, cid) {
  for (const s of Object.values(db.servers)) if (s.members[user.id] && s.channels.some((c) => c.id === cid)) return s
  throw new HttpError(404, 'Salon introuvable.')
}
const channelOf = (s, cid) => s.channels.find((c) => c.id === cid)

function msgView(m, s) {
  const u = db.users[m.author]
  const author = u
    ? (({ id, username, avatar_url, name_color, name_font, name_effect, frame, name_fx, title }) => ({ id, username, avatar_url, name_color, name_font, name_effect, frame, name_fx, title }))(pub(u, false))
    : { id: m.author, username: 'Ancien membre', avatar_url: null, name_color: '#9a9cb5', name_font: 'sans', name_effect: 'none', frame: null, name_fx: null, title: null }
  author.nick = s.members[m.author]?.nick || null
  author.role_color = roleColor(s, m.author)
  return {
    id: m.id, channelId: m.channelId, author, content: m.content,
    image_url: m.image ? `/api/images/${m.image}` : null,
    clip_url: m.clip ? `/api/clips/${m.clip}` : null,
    created: m.created, reactions: m.reactions,
  }
}
function removeMessageFiles(m) {
  removeFile(IMG_DIR, m.image)
  removeFile(CLIP_DIR, m.clip)
}
function purgeChannel(cid) {
  delete voice[cid]
  const list = msgs[cid]
  if (!list) return
  list.forEach(removeMessageFiles)
  delete msgs[cid]
  saveMsgs()
}
function pushMessage(s, cid, user, content, files) {
  const list = (msgs[cid] = msgs[cid] || [])
  const msg = { id: uid(), channelId: cid, author: user.id, content, image: files.image || null, clip: files.clip || null, created: Date.now(), reactions: {} }
  list.push(msg)
  if (files.clip) track(user, 'clips')
  else {
    if (files.image) track(user, 'images')
    if (content.length >= 3 || files.image) track(user, 'messages')
  }
  while (list.length > MAX_PER_CHANNEL) removeMessageFiles(list.shift())
  saveMsgs()
  const view = msgView(msg, s)
  broadcast(s, 'message', view)
  return view
}

const sendTimes = new Map()
function sendLimit(userId) {
  const now = Date.now()
  const list = (sendTimes.get(userId) || []).filter((t) => now - t < 5000)
  if (list.length >= 6) throw new HttpError(429, 'Tu écris trop vite, doucement 🙂')
  list.push(now)
  sendTimes.set(userId, list)
}
const lastSend = new Map()
function checkCanPost(s, user, channel, extra) {
  requireAccepted(s, user)
  need(s, user, 'send_messages')
  if (extra) need(s, user, extra)
  if (channel.readonly && !has(s, user.id, 'manage_messages')) throw forbidden('Ce salon est en lecture seule.')
  const key = `${channel.id}:${user.id}`
  if (channel.slowmode > 0 && !has(s, user.id, 'manage_messages')) {
    const wait = channel.slowmode * 1000 - (Date.now() - (lastSend.get(key) || 0))
    if (wait > 0) throw new HttpError(429, `Mode lent : attends encore ${Math.ceil(wait / 1000)} s.`)
  }
  sendLimit(user.id)
  lastSend.set(key, Date.now())
}

// ---------- Vocal (la voix passe en direct entre les joueurs ; le serveur sert d'intermédiaire) ----------
const MAX_VOICE = 8
const voice = {} // idDuSalon -> Map(idUtilisateur -> état)
const BUILTIN_SOUNDS = ['builtin:ding', 'builtin:buzzer', 'builtin:pouet', 'builtin:tada']
const voiceView = (cid) => [...(voice[cid] || new Map())].map(([userId, st]) => ({ userId, ...st }))
const voiceChannelOf = (userId) => Object.keys(voice).find((cid) => voice[cid].has(userId))
const serverOfChannel = (cid) => Object.values(db.servers).find((x) => x.channels.some((c) => c.id === cid))
function announceVoice(cid) {
  const s = serverOfChannel(cid)
  if (s) broadcast(s, 'voice', { channelId: cid, participants: voiceView(cid) })
}
function leaveVoice(userId) {
  for (const cid of Object.keys(voice)) {
    if (voice[cid].delete(userId)) {
      if (!voice[cid].size) delete voice[cid]
      announceVoice(cid)
    }
  }
}
const soundTimes = new Map()

// ---------- Économie : pièces, quêtes, badges, boutique ----------
const today = () => new Date().toLocaleDateString('sv')
const yesterday = () => new Date(Date.now() - 864e5).toLocaleDateString('sv')
const SHOP = [
  { id: 'frame_gold', slot: 'frame', name: 'Cadre doré', emoji: '🟡', price: 150 },
  { id: 'frame_neon', slot: 'frame', name: 'Cadre néon', emoji: '💠', price: 200 },
  { id: 'frame_rainbow', slot: 'frame', name: 'Cadre arc-en-ciel (animé)', emoji: '🌈', price: 400 },
  { id: 'frame_fire', slot: 'frame', name: 'Cadre de feu (animé)', emoji: '🔥', price: 500 },
  { id: 'bfx_aurora', slot: 'banner_fx', name: 'Bannière aurore (animée)', emoji: '🌌', price: 300 },
  { id: 'bfx_stars', slot: 'banner_fx', name: 'Bannière étoilée (animée)', emoji: '✨', price: 350 },
  { id: 'bfx_fire', slot: 'banner_fx', name: 'Bannière de braises (animée)', emoji: '🌋', price: 450 },
  { id: 'nfx_rainbow', slot: 'name_fx', name: 'Pseudo arc-en-ciel (animé)', emoji: '🌈', price: 400 },
  { id: 'nfx_pulse', slot: 'name_fx', name: 'Pseudo qui pulse', emoji: '💓', price: 250 },
  { id: 'nfx_shimmer', slot: 'name_fx', name: 'Pseudo scintillant', emoji: '💎', price: 300 },
  { id: 'title_legend', slot: 'title', name: 'Titre « Légende »', emoji: '👑', price: 200, value: 'Légende' },
  { id: 'title_pro', slot: 'title', name: 'Titre « Pro Gamer »', emoji: '🎮', price: 200, value: 'Pro Gamer' },
  { id: 'title_chief', slot: 'title', name: 'Titre « Chef de meute »', emoji: '🐺', price: 250, value: 'Chef de meute' },
  { id: 'title_night', slot: 'title', name: 'Titre « Oiseau de nuit »', emoji: '🦉', price: 150, value: 'Oiseau de nuit' },
]
const SHOP_BY = Object.fromEntries(SHOP.map((i) => [i.id, i]))
const SLOTS = ['frame', 'banner_fx', 'name_fx', 'title']
const QUESTS = [
  { id: 'msg10', stat: 'messages', goal: 10, reward: 30, label: 'Envoyer 10 messages' },
  { id: 'msg30', stat: 'messages', goal: 30, reward: 60, label: 'Envoyer 30 messages' },
  { id: 'react5', stat: 'reactions', goal: 5, reward: 25, label: 'Réagir à 5 messages' },
  { id: 'voice10', stat: 'voice_min', goal: 10, reward: 40, label: "Passer 10 min en vocal avec quelqu'un" },
  { id: 'voice30', stat: 'voice_min', goal: 30, reward: 90, label: "Passer 30 min en vocal avec quelqu'un" },
  { id: 'screen5', stat: 'screen_min', goal: 5, reward: 40, label: "Partager ton écran 5 min" },
  { id: 'img2', stat: 'images', goal: 2, reward: 30, label: 'Envoyer 2 images' },
  { id: 'clip1', stat: 'clips', goal: 1, reward: 50, label: 'Envoyer un clip' },
]
const QUEST_BY = Object.fromEntries(QUESTS.map((q) => [q.id, q]))
const BADGES = [
  { id: 'first_msg', name: 'Premier mot', emoji: '🎉', desc: 'Envoyer ton premier message', bonus: 20, test: (u) => u.stats.messages >= 1 },
  { id: 'chatty', name: 'Bavard', emoji: '💬', desc: 'Envoyer 500 messages', bonus: 100, test: (u) => u.stats.messages >= 500 },
  { id: 'talker', name: 'Voix d\'or', emoji: '🎙️', desc: '60 minutes en vocal', bonus: 60, test: (u) => u.stats.voice_min >= 60 },
  { id: 'streamer', name: 'Streamer', emoji: '🖥️', desc: "30 minutes de partage d'écran", bonus: 80, test: (u) => u.stats.screen_min >= 30 },
  { id: 'clipper', name: 'Clipper', emoji: '🎬', desc: 'Envoyer un clip', bonus: 40, test: (u) => u.stats.clips >= 1 },
  { id: 'loyal', name: 'Fidèle', emoji: '🔥', desc: '7 jours de suite de récompense quotidienne', bonus: 100, test: (u) => u.stats.maxStreak >= 7 },
  { id: 'rich', name: 'Riche', emoji: '💰', desc: 'Gagner 1000 pièces en tout', bonus: 0, test: (u) => u.stats.earned >= 1000 },
  { id: 'collector', name: 'Collectionneur', emoji: '🛍️', desc: 'Posséder 5 objets de la boutique', bonus: 50, test: (u) => u.inventory.length >= 5 },
  { id: 'gamer', name: 'Gamer', emoji: '🎮', desc: 'Ajouter 5 jeux à ta collection', bonus: 30, test: (u) => (u.games || []).length >= 5 },
]
const STAT_KEYS = ['messages', 'images', 'reactions', 'clips', 'voice_min', 'screen_min', 'earned', 'maxStreak']

function pickQuests(userId, d) {
  const key = (q) => crypto.createHash('sha256').update(userId + d + q.id).digest().readUInt32BE(0)
  return [...QUESTS].sort((a, b) => key(a) - key(b)).slice(0, 3).map((q) => q.id)
}
function eco(u) {
  u.coins ??= 0
  u.stats ??= {}
  for (const k of STAT_KEYS) u.stats[k] ??= 0
  u.badges ??= []
  u.inventory ??= []
  u.equipped ??= {}
  u.daily ??= { last: null, streak: 0 }
  const d = today()
  if (!u.quests || u.quests.day !== d) u.quests = { day: d, ids: pickQuests(u.id, d), progress: {}, claimed: [] }
  return u
}
function notify(u, text) {
  for (const c of clients) if (c.userId === u.id) push(c, 'notice', { text })
}
function earn(u, n) {
  u.coins += n
  u.stats.earned += n
}
function checkBadges(u) {
  for (const b of BADGES) {
    if (u.badges.some((x) => x.id === b.id) || !b.test(u)) continue
    u.badges.push({ id: b.id, at: Date.now() })
    if (b.bonus) earn(u, b.bonus)
    notify(u, `${b.emoji} Badge « ${b.name} » débloqué !${b.bonus ? ` +${b.bonus} 🪙` : ''}`)
  }
}
function track(u, stat, n = 1) {
  eco(u)
  u.stats[stat] += n
  for (const qid of u.quests.ids) {
    const q = QUEST_BY[qid]
    if (q.stat === stat && !u.quests.claimed.includes(qid)) u.quests.progress[qid] = Math.min(q.goal, (u.quests.progress[qid] || 0) + n)
  }
  checkBadges(u)
  save()
}
const dailyReward = (streak) => 50 + Math.min(Math.max(streak - 1, 0), 5) * 10
function ecoView(u) {
  eco(u)
  const claimedToday = u.daily.last === today()
  const nextStreak = claimedToday ? u.daily.streak : u.daily.last === yesterday() ? u.daily.streak + 1 : 1
  return {
    coins: u.coins,
    daily: { canClaim: !claimedToday, streak: u.daily.streak, reward: dailyReward(nextStreak) },
    quests: u.quests.ids.map((id) => ({ ...QUEST_BY[id], stat: undefined, progress: u.quests.progress[id] || 0, claimed: u.quests.claimed.includes(id) })),
    badges: BADGES.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, desc: b.desc, bonus: b.bonus, earned: u.badges.some((x) => x.id === b.id) })),
    stats: u.stats,
    inventory: u.inventory,
    equipped: u.equipped,
    shop: SHOP,
  }
}
// Toutes les minutes : temps de vocal (avec au moins une autre personne, pas en sourdine) et de partage d'écran
setInterval(() => {
  for (const members of Object.values(voice)) {
    if (members.size < 2) continue
    for (const [userId, st] of members) {
      const u = db.users[userId]
      if (!u || st.deafened) continue
      track(u, 'voice_min')
      if (st.screen) track(u, 'screen_min')
    }
  }
}, Number(process.env.TICK_MS) || 60000)

// ---------- Jeux (collection du profil) ----------
const GAME_STATUS = ['playing', 'completed', 'backlog', 'wishlist']
const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Switch', 'Mobile', 'Autre']
function cleanGames(list) {
  if (!Array.isArray(list) || list.length > 100) throw bad('100 jeux maximum.')
  const seen = new Set()
  return list.map((g) => {
    const gname = name(g && g.name, 1, 60, 'Nom du jeu')
    if (seen.has(nameKey(gname))) throw bad(`« ${gname} » est déjà dans ta collection.`)
    seen.add(nameKey(gname))
    if (!GAME_STATUS.includes(g.status)) throw bad('Statut de jeu invalide.')
    if (!PLATFORMS.includes(g.platform)) throw bad('Plateforme invalide.')
    const hours = Number(g.hours || 0)
    if (!Number.isFinite(hours) || hours < 0 || hours > 99999) throw bad('Heures de jeu invalides.')
    const rating = g.rating === undefined || g.rating === null || g.rating === 0 ? 0 : Number(g.rating)
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw bad('Note : 0 à 5.')
    return {
      name: gname, status: g.status, platform: g.platform, hours: Math.round(hours * 10) / 10, rating,
      favorite: Boolean(g.favorite), emoji: freeText(g.emoji, 8, 'Emoji').replace(/\n/g, '') || '🎮',
      note: freeText(g.note, 120, 'Note').replace(/\n/g, ' '),
    }
  })
}

// ---------- Connexion avec Google ----------
// Le navigateur de l'utilisateur ouvre la page /google de CE serveur, Google lui renvoie un jeton,
// et l'appli récupère la session en interrogeant /api/google/poll (aucun mot de passe Google n'est vu).
const googleStates = new Map() // state -> { userId|null, result, expires }
const TOKENINFO = process.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo'
async function verifyGoogle(credential) {
  const r = await fetch(`${TOKENINFO}?id_token=${encodeURIComponent(credential)}`)
  const info = await r.json().catch(() => ({}))
  if (!r.ok || !info.sub) throw new HttpError(401, 'Connexion Google refusée.')
  if (info.aud !== config.googleClientId) throw new HttpError(401, 'Ce jeton Google ne vient pas de cette appli.')
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(info.iss)) throw new HttpError(401, 'Jeton Google invalide.')
  if (String(info.email_verified) !== 'true') throw new HttpError(401, "L'adresse Google n'est pas vérifiée.")
  if (Number(info.exp) * 1000 < Date.now()) throw new HttpError(401, 'Jeton Google expiré.')
  return info
}
setInterval(() => {
  for (const [k, v] of googleStates) if (v.expires < Date.now()) googleStates.delete(k)
}, 60000)
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function googlePage(state) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MonApp — Connexion Google</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#f2f3f5;display:grid;place-items:center;min-height:100vh;margin:0}
.c{background:#14142a;padding:28px;border-radius:16px;max-width:380px;width:92%;text-align:center}input{width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#0d0d1f;color:#fff;margin:8px 0;box-sizing:border-box}
#msg{margin-top:14px;font-size:14px}</style>
<div class="c"><h2>Connexion avec Google</h2>
<p style="color:#9a9cb5;font-size:14px">Première connexion ? Entre le code d'inscription du serveur (sinon laisse vide).</p>
<input id="code" placeholder="Code d'inscription" autocapitalize="characters">
<div id="g" style="display:flex;justify-content:center;margin-top:10px"></div><div id="msg"></div></div>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
window.onload=function(){var t=setInterval(function(){if(!window.google||!google.accounts)return;clearInterval(t);
google.accounts.id.initialize({client_id:${JSON.stringify(config.googleClientId || '')},callback:async function(r){
var m=document.getElementById('msg');m.textContent='Vérification…';
try{var res=await fetch('/api/google/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:${JSON.stringify(state)},credential:r.credential,signupCode:document.getElementById('code').value})});
var j=await res.json();m.textContent=res.ok?'✅ Connecté ! Tu peux fermer cette page et retourner dans MonApp.':('❌ '+(j.error||'Erreur'));}catch(e){m.textContent='❌ Serveur injoignable'}}});
google.accounts.id.renderButton(document.getElementById('g'),{theme:'filled_blue',size:'large',text:'continue_with',locale:'fr'});},300)}
</script></html>`
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

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > max) tooBig = true
      else chunks.push(c)
    })
    req.on('end', () => (tooBig ? reject(new HttpError(413, 'Fichier trop volumineux.')) : resolve(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}
async function readBody(req, max = 400 * 1024) {
  const buf = await readRaw(req, max)
  if (!buf.length) return {}
  try {
    const v = JSON.parse(buf.toString('utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw bad('JSON invalide.')
  }
}

function authUser(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '')
  const id = m && db.sessions[m[1]]
  const user = id && db.users[id]
  if (!user) throw new HttpError(401, 'Session expirée, reconnecte-toi.')
  user.lastSeen = Date.now()
  return { user, token: m[1] }
}

const FOREVER = 'public, max-age=31536000, immutable'
function serveFile(res, folder, file, types) {
  const ext = path.extname(file).slice(1)
  fs.readFile(path.join(folder, path.basename(file)), (err, data) => {
    if (err || !types[ext]) return send(res, 404, { error: 'Fichier introuvable.' })
    send(res, 200, data, { 'Content-Type': types[ext], 'Cache-Control': FOREVER })
  })
}
function serveDataUrl(res, value) {
  const a = value && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(value)
  if (!a) return send(res, 404, { error: 'Aucune image.' })
  send(res, 200, Buffer.from(a[2], 'base64'), { 'Content-Type': a[1], 'Cache-Control': FOREVER })
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  const method = req.method
  let m

  // ===== Public =====
  if (p === '/api/ping' && method === 'GET') return send(res, 200, { ok: true, app: 'MonApp', version: 7, signupCode: Boolean(config.codeInscription), google: Boolean(config.googleClientId) })

  if ((m = /^\/api\/avatar\/([\w-]+)$/.exec(p)) && method === 'GET') return serveDataUrl(res, db.users[m[1]]?.avatar)
  if ((m = /^\/api\/banner\/([\w-]+)$/.exec(p)) && method === 'GET') return serveDataUrl(res, db.users[m[1]]?.banner)
  if ((m = /^\/api\/server-icon\/([\w-]+)$/.exec(p)) && method === 'GET') return serveDataUrl(res, db.servers[m[1]]?.icon)
  if ((m = /^\/api\/images\/([\w-]+\.(?:png|jpg|webp))$/.exec(p)) && method === 'GET') return serveFile(res, IMG_DIR, m[1], IMG_TYPES)
  if ((m = /^\/api\/clips\/([\w-]+\.webm)$/.exec(p)) && method === 'GET') return serveFile(res, CLIP_DIR, m[1], { webm: 'video/webm' })
  if ((m = /^\/api\/sounds\/([\w-]+\.(?:mp3|wav|ogg|webm))$/.exec(p)) && method === 'GET') return serveFile(res, SOUND_DIR, m[1], SOUND_TYPES)

  if (p === '/api/events' && method === 'GET') {
    const t = url.searchParams.get('token') || ''
    const userId = db.sessions[t]
    if (!userId || !db.users[userId]) throw new HttpError(401, 'Session expirée, reconnecte-toi.')
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write(': connecté\n\n')
    const c = { res, userId }
    clients.add(c)
    db.users[userId].lastSeen = Date.now()
    res.on('close', () => {
      clients.delete(c)
      setTimeout(() => {
        if (![...clients].some((x) => x.userId === userId)) leaveVoice(userId)
      }, 10000)
    })
    return
  }

  if (p === '/google' && method === 'GET') {
    const st = googleStates.get(url.searchParams.get('state') || '')
    if (!config.googleClientId || !st) return send(res, 404, '<p>Lien expiré ou Google non configuré.</p>', { 'Content-Type': 'text/html; charset=utf-8' })
    return send(res, 200, googlePage(url.searchParams.get('state')), { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer' })
  }

  if (p === '/api/google/start' && method === 'POST') {
    if (!config.googleClientId) throw bad("La connexion Google n'est pas activée sur ce serveur.")
    limit(req)
    let userId = null
    if (/^Bearer /.test(req.headers.authorization || '')) userId = authUser(req).user.id // liaison d'un compte existant
    const state = crypto.randomBytes(24).toString('hex')
    googleStates.set(state, { userId, result: null, expires: Date.now() + 5 * 60 * 1000 })
    return send(res, 200, { state })
  }

  if (p === '/api/google/complete' && method === 'POST') {
    limit(req)
    const b = await readBody(req)
    const st = googleStates.get(String(b.state || ''))
    if (!st || st.result) throw bad('Lien expiré : recommence depuis MonApp.')
    const info = await verifyGoogle(String(b.credential || ''))
    if (st.userId) {
      const me = db.users[st.userId]
      if (Object.values(db.users).some((u) => u.id !== me.id && u.google && u.google.sub === info.sub)) throw new HttpError(409, 'Ce compte Google est déjà lié à un autre compte.')
      me.google = { sub: info.sub, email: info.email }
      save()
      st.result = { linked: true }
      return send(res, 200, { ok: true })
    }
    let u = Object.values(db.users).find((x) => x.google && x.google.sub === info.sub)
    if (!u) {
      if (config.codeInscription && String(b.signupCode || '').trim().toUpperCase() !== String(config.codeInscription).toUpperCase())
        throw new HttpError(403, "Première connexion : le code d'inscription du serveur est nécessaire.")
      let base = String(info.given_name || info.name || String(info.email).split('@')[0] || 'Joueur').normalize('NFC')
      base = [...base].filter((ch) => !INVISIBLE.test(ch)).join('').trim().slice(0, 28) || 'Joueur'
      let username = base
      for (let i = 2; usernameTaken(username); i++) username = `${base.slice(0, 28)}${i}`
      u = {
        id: uid(), username, salt: '', hash: '', googleOnly: true, google: { sub: info.sub, email: info.email },
        bio: '', avatar: null, avatarV: 0, status: 'online', name_color: '#ffffff', name_font: 'sans', name_effect: 'none',
        pronouns: '', location: '', custom_status: null, links: [], banner_color: '', banner: null, bannerV: 0,
        created: Date.now(), lastSeen: Date.now(),
      }
      db.users[u.id] = u
    }
    st.result = { token: newSession(u.id), user: pub(u, true) }
    save()
    return send(res, 200, { ok: true })
  }

  if (p === '/api/google/poll' && method === 'GET') {
    const key = url.searchParams.get('state') || ''
    const st = googleStates.get(key)
    if (!st) throw new HttpError(404, 'Lien expiré.')
    if (!st.result) return send(res, 200, { pending: true })
    googleStates.delete(key)
    return send(res, 200, st.result)
  }

  if (p === '/api/signup' && method === 'POST') {
    limit(req)
    const b = await readBody(req)
    if (config.codeInscription && String(b.signupCode || '').trim().toUpperCase() !== String(config.codeInscription).toUpperCase())
      throw new HttpError(403, "Code d'inscription incorrect.")
    const username = name(b.username, 1, 32, 'Pseudo')
    if (typeof b.password !== 'string' || b.password.length < 6 || b.password.length > 200)
      throw bad('Le mot de passe doit faire au moins 6 caractères.')
    if (usernameTaken(username)) throw new HttpError(409, 'Ce pseudo est déjà pris.')
    const salt = crypto.randomBytes(16).toString('hex')
    const user = {
      id: uid(), username, salt, hash: hash(b.password, salt), bio: '', avatar: null, avatarV: 0,
      status: 'online', name_color: '#ffffff', name_font: 'sans', name_effect: 'none',
      pronouns: '', location: '', custom_status: null, links: [], banner_color: '', banner: null, bannerV: 0,
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
    const key = nameKey(String(b.username || '').trim())
    const user = Object.values(db.users).find((u) => nameKey(u.username) === key)
    if (!user || user.googleOnly || typeof b.password !== 'string' || !sameHash(hash(b.password, user.salt), user.hash))
      throw new HttpError(401, 'Pseudo ou mot de passe incorrect.')
    user.lastSeen = Date.now()
    return send(res, 200, { token: newSession(user.id), user: pub(user, true) })
  }

  // ===== Connecté =====
  const { user, token } = authUser(req)

  if (p === '/api/logout' && method === 'POST') {
    delete db.sessions[token]
    leaveVoice(user.id)
    save()
    return send(res, 200, { ok: true })
  }

  // ----- Économie -----
  if (p === '/api/economy' && method === 'GET') return send(res, 200, ecoView(user))

  if (p === '/api/economy/daily' && method === 'POST') {
    eco(user)
    if (user.daily.last === today()) throw bad("Tu as déjà récupéré ta récompense aujourd'hui.")
    user.daily.streak = user.daily.last === yesterday() ? user.daily.streak + 1 : 1
    user.daily.last = today()
    user.stats.maxStreak = Math.max(user.stats.maxStreak, user.daily.streak)
    const reward = dailyReward(user.daily.streak)
    earn(user, reward)
    checkBadges(user)
    save()
    return send(res, 200, { reward, economy: ecoView(user) })
  }

  if ((m = /^\/api\/economy\/quests\/([\w-]+)\/claim$/.exec(p)) && method === 'POST') {
    eco(user)
    const q = QUEST_BY[m[1]]
    if (!q || !user.quests.ids.includes(q.id)) throw new HttpError(404, 'Quête introuvable.')
    if (user.quests.claimed.includes(q.id)) throw bad('Récompense déjà récupérée.')
    if ((user.quests.progress[q.id] || 0) < q.goal) throw bad("La quête n'est pas terminée.")
    user.quests.claimed.push(q.id)
    earn(user, q.reward)
    checkBadges(user)
    save()
    return send(res, 200, { reward: q.reward, economy: ecoView(user) })
  }

  if (p === '/api/shop/buy' && method === 'POST') {
    eco(user)
    const b = await readBody(req)
    const item = SHOP_BY[b.itemId]
    if (!item) throw new HttpError(404, 'Objet introuvable.')
    if (user.inventory.includes(item.id)) throw bad('Tu possèdes déjà cet objet.')
    if (user.coins < item.price) throw bad(`Il te manque ${item.price - user.coins} pièces.`)
    user.coins -= item.price
    user.inventory.push(item.id)
    checkBadges(user)
    save()
    return send(res, 200, { economy: ecoView(user) })
  }

  if (p === '/api/shop/equip' && method === 'POST') {
    eco(user)
    const b = await readBody(req)
    if (!SLOTS.includes(b.slot)) throw bad('Emplacement invalide.')
    if (b.itemId === null) delete user.equipped[b.slot]
    else {
      const item = SHOP_BY[b.itemId]
      if (!item || item.slot !== b.slot || !user.inventory.includes(item.id)) throw forbidden("Tu ne possèdes pas cet objet.")
      user.equipped[b.slot] = item.id
    }
    save()
    for (const s of Object.values(db.servers)) if (s.members[user.id]) broadcast(s, 'refresh', {})
    return send(res, 200, { economy: ecoView(user) })
  }

  // ----- Compte Google / jeux -----
  if (p === '/api/me/google' && method === 'GET') return send(res, 200, { linked: Boolean(user.google), email: user.google?.email || null, googleOnly: Boolean(user.googleOnly) })
  if (p === '/api/me/google' && method === 'DELETE') {
    if (user.googleOnly) throw bad("Ton compte n'a pas de mot de passe : tu ne peux pas délier Google (tu serais bloqué dehors).")
    delete user.google
    save()
    return send(res, 200, { ok: true })
  }

  if (p === '/api/me/games' && method === 'GET') return send(res, 200, { games: user.games || [], public: user.gamesPublic !== false })
  if (p === '/api/me/games' && method === 'PUT') {
    const b = await readBody(req)
    user.games = cleanGames(b.games)
    if (b.public !== undefined) user.gamesPublic = Boolean(b.public)
    eco(user)
    checkBadges(user)
    save()
    return send(res, 200, { games: user.games, public: user.gamesPublic !== false })
  }
  if ((m = /^\/api\/users\/([\w-]+)\/games$/.exec(p)) && method === 'GET') {
    const u = db.users[m[1]]
    if (!u) throw new HttpError(404, 'Utilisateur introuvable.')
    if (u.id !== user.id && u.gamesPublic === false) return send(res, 200, { games: [], hidden: true })
    return send(res, 200, { games: u.games || [] })
  }

  // ----- Profil -----
  if (p === '/api/me' && method === 'GET') return send(res, 200, { user: { ...pub(user, true), ...fullProfile(user, true), coins: eco(user).coins } })

  if (p === '/api/me' && method === 'PATCH') {
    const b = await readBody(req, 700 * 1024)
    if (b.username !== undefined) {
      const n = name(b.username, 1, 32, 'Pseudo')
      if (usernameTaken(n, user.id)) throw new HttpError(409, 'Ce pseudo est déjà pris.')
      user.username = n
    }
    if (b.bio !== undefined) user.bio = freeText(b.bio, 190, 'Bio')
    if (b.pronouns !== undefined) user.pronouns = freeText(b.pronouns, 40, 'Pronoms').replace(/\n/g, ' ')
    if (b.location !== undefined) user.location = freeText(b.location, 40, 'Lieu').replace(/\n/g, ' ')
    if (b.custom_status !== undefined) {
      if (b.custom_status === null) user.custom_status = null
      else {
        const emoji = freeText(b.custom_status.emoji, 8, 'Emoji').replace(/\n/g, '')
        const t = freeText(b.custom_status.text, 60, 'Statut').replace(/\n/g, ' ')
        user.custom_status = emoji || t ? { emoji, text: t } : null
      }
    }
    if (b.links !== undefined) {
      if (!Array.isArray(b.links) || b.links.length > 5) throw bad('5 liens maximum.')
      user.links = b.links.map((l) => {
        const url2 = freeText(l && l.url, 200, 'Lien')
        if (!/^https?:\/\/[^\s]+$/i.test(url2)) throw bad('Les liens doivent commencer par http:// ou https://')
        return { label: freeText(l.label, 30, 'Nom du lien').replace(/\n/g, ' ') || url2, url: url2 }
      })
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw bad('Statut invalide.')
      user.status = b.status
    }
    if (b.name_color !== undefined) {
      if (!HEX.test(b.name_color)) throw bad('Couleur invalide.')
      user.name_color = b.name_color
    }
    if (b.banner_color !== undefined) {
      if (b.banner_color !== '' && !HEX.test(b.banner_color)) throw bad('Couleur invalide.')
      user.banner_color = b.banner_color
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
      else {
        dataUrl(b.avatar, ['image/png', 'image/jpeg', 'image/webp'], 190 * 1024, 'Avatar')
        user.avatar = b.avatar
      }
      user.avatarV = (user.avatarV || 0) + 1
    }
    if (b.banner !== undefined) {
      if (b.banner === null) user.banner = null
      else {
        dataUrl(b.banner, ['image/png', 'image/jpeg', 'image/webp'], 450 * 1024, 'Bannière')
        user.banner = b.banner
      }
      user.bannerV = (user.bannerV || 0) + 1
    }
    save()
    return send(res, 200, { user: { ...pub(user, true), ...fullProfile(user, true) } })
  }

  if ((m = /^\/api\/users\/([\w-]+)\/profile$/.exec(p)) && method === 'GET') {
    const u = db.users[m[1]]
    if (!u) throw new HttpError(404, 'Utilisateur introuvable.')
    const out = { user: fullProfile(u, u.id === user.id) }
    const sid = url.searchParams.get('server')
    const s = sid && db.servers[sid]
    if (s && s.members[user.id] && s.members[u.id]) out.member = memberView(s, u.id, user.id)
    return send(res, 200, out)
  }

  // ----- Serveurs -----
  if (p === '/api/servers' && method === 'GET') {
    const list = Object.values(db.servers).filter((s) => s.members[user.id]).map((s) => serverView(s, user))
    return send(res, 200, { servers: list })
  }

  if (p === '/api/servers' && method === 'POST') {
    const b = await readBody(req)
    const n = name(b.name, 1, 40, 'Nom du serveur')
    if (Object.values(db.servers).filter((s) => s.owner === user.id).length >= 10) throw bad('Maximum 10 serveurs par personne.')
    const s = newServer(user.id, n)
    db.servers[s.id] = s
    save()
    return send(res, 201, { server: serverView(s, user) })
  }

  function joinServer(s) {
    if (s.bans[user.id]) throw forbidden('Tu as été banni de ce serveur.')
    if (!s.members[user.id]) {
      if (Object.keys(s.members).length >= 500) throw bad('Ce serveur est plein.')
      s.members[user.id] = newMember(!(s.community.enabled && s.community.requireAccept))
      save()
      broadcast(s, 'refresh', {})
    }
    return send(res, 200, { server: serverView(s, user) })
  }

  if (p === '/api/servers/join' && method === 'POST') {
    const b = await readBody(req)
    const code = String(b.code || '').trim().toUpperCase()
    const s = Object.values(db.servers).find((x) => x.invite === code)
    if (!s) throw new HttpError(404, "Code d'invitation invalide.")
    return joinServer(s)
  }

  if (p === '/api/discover' && method === 'GET') {
    const list = Object.values(db.servers)
      .filter((s) => s.community.enabled && s.community.public && !s.bans[user.id])
      .map((s) => ({
        id: s.id, name: s.name, description: s.description,
        icon_url: s.icon ? `/api/server-icon/${s.id}?v=${s.iconV}` : null,
        memberCount: Object.keys(s.members).length, joined: Boolean(s.members[user.id]),
      }))
    return send(res, 200, { servers: list })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/join-public$/.exec(p)) && method === 'POST') {
    const s = db.servers[m[1]]
    if (!s || !s.community.enabled || !s.community.public) throw new HttpError(404, 'Serveur introuvable.')
    return joinServer(s)
  }

  if ((m = /^\/api\/servers\/([\w-]+)$/.exec(p))) {
    const s = serverFor(user, m[1])
    if (method === 'GET') return send(res, 200, { server: serverView(s, user) })

    if (method === 'PATCH') {
      const b = await readBody(req, 400 * 1024)
      if (b.name !== undefined || b.description !== undefined || b.icon !== undefined || b.community !== undefined) need(s, user, 'manage_server')
      if (b.name !== undefined) s.name = name(b.name, 1, 40, 'Nom du serveur')
      if (b.description !== undefined) s.description = freeText(b.description, 300, 'Description')
      if (b.icon !== undefined) {
        if (b.icon === null) s.icon = null
        else {
          dataUrl(b.icon, ['image/png', 'image/jpeg', 'image/webp'], 250 * 1024, 'Icône')
          s.icon = b.icon
        }
        s.iconV++
      }
      if (b.community !== undefined) {
        const c = b.community || {}
        s.community.enabled = Boolean(c.enabled)
        if (c.rules !== undefined) s.community.rules = freeText(c.rules, 2000, 'Règlement')
        if (c.welcome !== undefined) s.community.welcome = freeText(c.welcome, 500, "Message d'accueil")
        s.community.requireAccept = s.community.enabled && Boolean(c.requireAccept)
        s.community.public = s.community.enabled && Boolean(c.public)
        if (s.community.public && !s.description) throw bad('Ajoute une description au serveur pour le rendre public.')
      }
      if (b.everyone && b.everyone.permissions) {
        need(s, user, 'manage_roles')
        const perms = cleanPerms(b.everyone.permissions)
        checkGrant(s, user, perms)
        s.everyone.permissions = perms
      }
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }

    if (method === 'DELETE') {
      if (s.owner !== user.id) throw forbidden('Réservé au propriétaire.')
      for (const c of s.channels) purgeChannel(c.id)
      s.sounds.forEach((x) => removeFile(SOUND_DIR, x.file))
      broadcast(s, 'refresh', {})
      delete db.servers[s.id]
      save()
      return send(res, 200, { ok: true })
    }
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/transfer$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (s.owner !== user.id) throw forbidden('Réservé au propriétaire.')
    const b = await readBody(req)
    if (!s.members[b.userId] || b.userId === user.id) throw bad('Membre invalide.')
    s.owner = b.userId
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/accept-rules$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    s.members[user.id].accepted = true
    save()
    return send(res, 200, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/leave$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    if (s.owner === user.id) throw bad('Le propriétaire ne peut pas quitter : transfère la propriété ou supprime le serveur.')
    delete s.members[user.id]
    leaveVoice(user.id)
    save()
    broadcast(s, 'refresh', {}, [user.id])
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/invite\/reset$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_server')
    s.invite = newInvite()
    save()
    return send(res, 200, { server: serverView(s, user) })
  }

  // ----- Membres -----
  if ((m = /^\/api\/servers\/([\w-]+)\/members$/.exec(p)) && method === 'GET') {
    const s = serverFor(user, m[1])
    const members = Object.keys(s.members).filter((id) => db.users[id]).map((id) => memberView(s, id, user.id))
    return send(res, 200, { members })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members\/([\w-]+)$/.exec(p))) {
    const s = serverFor(user, m[1])
    const target = m[2]
    if (method === 'PATCH') {
      if (!s.members[target]) throw new HttpError(404, 'Membre introuvable.')
      const b = await readBody(req)
      if (target === user.id) need(s, user, 'change_nickname')
      else {
        need(s, user, 'manage_nicknames')
        if (!canActOn(s, user.id, target)) throw forbidden()
      }
      const nick = b.nick === null || b.nick === '' ? null : name(b.nick, 1, 32, 'Surnom')
      s.members[target].nick = nick
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { ok: true })
    }
    if (method === 'DELETE') {
      need(s, user, 'kick_members')
      if (!s.members[target] || target === user.id || !canActOn(s, user.id, target)) throw forbidden("Tu ne peux pas exclure ce membre.")
      delete s.members[target]
      leaveVoice(target)
      save()
      broadcast(s, 'refresh', {}, [target])
      return send(res, 200, { ok: true })
    }
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members\/([\w-]+)\/ban$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    const target = m[2]
    need(s, user, 'ban_members')
    if (!s.members[target] || target === user.id || !canActOn(s, user.id, target)) throw forbidden('Tu ne peux pas bannir ce membre.')
    const b = await readBody(req)
    s.bans[target] = { reason: freeText(b.reason, 200, 'Raison'), by: user.id, at: Date.now() }
    delete s.members[target]
    leaveVoice(target)
    save()
    broadcast(s, 'refresh', {}, [target])
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/members\/([\w-]+)\/roles$/.exec(p)) && method === 'PUT') {
    const s = serverFor(user, m[1])
    const target = m[2]
    need(s, user, 'manage_roles')
    if (!s.members[target] || target === s.owner) throw bad('Membre invalide.')
    if (target !== user.id && !canActOn(s, user.id, target)) throw forbidden()
    const b = await readBody(req)
    const next = [...new Set(Array.isArray(b.roles) ? b.roles : [])]
    if (next.some((rid) => !s.roles.some((r) => r.id === rid))) throw bad('Rôle inconnu.')
    const old = s.members[target].roles
    const changed = [...old.filter((r) => !next.includes(r)), ...next.filter((r) => !old.includes(r))]
    const mine = topRank(s, user.id)
    if (changed.some((rid) => rankOf(s, rid) >= mine)) throw forbidden('Tu ne peux gérer que les rôles placés sous le tien.')
    s.members[target].roles = next
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/bans$/.exec(p)) && method === 'GET') {
    const s = serverFor(user, m[1])
    need(s, user, 'ban_members')
    const bans = Object.entries(s.bans).map(([id, b]) => ({ userId: id, username: db.users[id]?.username ?? '?', reason: b.reason, at: b.at }))
    return send(res, 200, { bans })
  }
  if ((m = /^\/api\/servers\/([\w-]+)\/bans\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = serverFor(user, m[1])
    need(s, user, 'ban_members')
    delete s.bans[m[2]]
    save()
    return send(res, 200, { ok: true })
  }

  // ----- Rôles -----
  if ((m = /^\/api\/servers\/([\w-]+)\/roles$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_roles')
    if (s.roles.length >= 50) throw bad('Maximum 50 rôles.')
    const b = await readBody(req)
    const perms = cleanPerms(b.permissions)
    checkGrant(s, user, perms)
    const color = b.color === undefined || b.color === '' ? '' : HEX.test(b.color) ? b.color : (() => { throw bad('Couleur invalide.') })()
    const role = { id: uid(), name: name(b.name, 1, 32, 'Nom du rôle'), color, hoist: Boolean(b.hoist), permissions: perms }
    // Le nouveau rôle se place juste sous celui de l'auteur (tout en bas pour le propriétaire)
    s.roles.push(role)
    save()
    broadcast(s, 'refresh', {})
    return send(res, 201, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/roles\/([\w-]+)$/.exec(p))) {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_roles')
    const role = s.roles.find((r) => r.id === m[2])
    if (!role) throw new HttpError(404, 'Rôle introuvable.')
    if (rankOf(s, role.id) >= topRank(s, user.id)) throw forbidden('Ce rôle est au-dessus du tien.')
    if (method === 'PATCH') {
      const b = await readBody(req)
      if (b.name !== undefined) role.name = name(b.name, 1, 32, 'Nom du rôle')
      if (b.color !== undefined) {
        if (b.color !== '' && !HEX.test(b.color)) throw bad('Couleur invalide.')
        role.color = b.color
      }
      if (b.hoist !== undefined) role.hoist = Boolean(b.hoist)
      if (b.permissions !== undefined) {
        const perms = cleanPerms(b.permissions)
        const added = Object.fromEntries(Object.keys(perms).filter((k) => !role.permissions[k]).map((k) => [k, true]))
        checkGrant(s, user, added)
        role.permissions = perms
      }
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }
    if (method === 'DELETE') {
      s.roles = s.roles.filter((r) => r.id !== role.id)
      for (const mem of Object.values(s.members)) mem.roles = mem.roles.filter((r) => r !== role.id)
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/roles\/([\w-]+)\/move$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_roles')
    const b = await readBody(req)
    const i = s.roles.findIndex((r) => r.id === m[2])
    if (i < 0) throw new HttpError(404, 'Rôle introuvable.')
    if (rankOf(s, s.roles[i].id) >= topRank(s, user.id)) throw forbidden('Ce rôle est au-dessus du tien.')
    const j = b.dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= s.roles.length) return send(res, 200, { server: serverView(s, user) })
    if (b.dir === 'up' && rankOf(s, s.roles[j].id) >= topRank(s, user.id)) throw forbidden('Tu ne peux pas monter ce rôle au-dessus du tien.')
    ;[s.roles[i], s.roles[j]] = [s.roles[j], s.roles[i]]
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { server: serverView(s, user) })
  }

  // ----- Salons -----
  if ((m = /^\/api\/servers\/([\w-]+)\/channels$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_channels')
    const b = await readBody(req)
    if (s.channels.length >= 50) throw bad('Maximum 50 salons.')
    const ch = mkChannel(cleanChannelName(b.name), b.type === 'voice' ? 'voice' : 'text', freeText(b.topic, 200, 'Sujet').replace(/\n/g, ' '))
    s.channels.push(ch)
    save()
    broadcast(s, 'refresh', {})
    return send(res, 201, { server: serverView(s, user) })
  }

  if ((m = /^\/api\/servers\/([\w-]+)\/channels\/([\w-]+)$/.exec(p))) {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_channels')
    const ch = channelOf(s, m[2])
    if (!ch) throw new HttpError(404, 'Salon introuvable.')
    if (method === 'PATCH') {
      const b = await readBody(req)
      if (b.name !== undefined) ch.name = cleanChannelName(b.name)
      if (b.topic !== undefined) ch.topic = freeText(b.topic, 200, 'Sujet').replace(/\n/g, ' ')
      if (b.slowmode !== undefined) {
        const n = Number(b.slowmode)
        if (!Number.isInteger(n) || n < 0 || n > 21600) throw bad('Mode lent : 0 à 21600 secondes.')
        ch.slowmode = n
      }
      if (b.readonly !== undefined) ch.readonly = Boolean(b.readonly)
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }
    if (method === 'DELETE') {
      if (s.channels.length <= 1) throw bad('Un serveur doit garder au moins un salon.')
      s.channels = s.channels.filter((c) => c.id !== ch.id)
      purgeChannel(ch.id)
      save()
      broadcast(s, 'refresh', {})
      return send(res, 200, { server: serverView(s, user) })
    }
  }

  // ----- Soundboard -----
  if ((m = /^\/api\/servers\/([\w-]+)\/sounds$/.exec(p)) && method === 'POST') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_soundboard')
    if (s.sounds.length >= 24) throw bad('Maximum 24 sons.')
    const b = await readBody(req, 700 * 1024)
    const { mime, buf } = dataUrl(b.data, Object.keys(SOUND_MIME), 400 * 1024, 'Son')
    const file = `${uid()}.${SOUND_MIME[mime]}`
    fs.writeFileSync(path.join(SOUND_DIR, file), buf)
    s.sounds.push({ id: uid(), name: name(b.name, 1, 24, 'Nom du son'), emoji: freeText(b.emoji, 8, 'Emoji').replace(/\n/g, '') || '🔊', file, by: user.id })
    save()
    broadcast(s, 'refresh', {})
    return send(res, 201, { server: serverView(s, user) })
  }
  if ((m = /^\/api\/servers\/([\w-]+)\/sounds\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = serverFor(user, m[1])
    need(s, user, 'manage_soundboard')
    const snd = s.sounds.find((x) => x.id === m[2])
    if (!snd) throw new HttpError(404, 'Son introuvable.')
    s.sounds = s.sounds.filter((x) => x.id !== snd.id)
    removeFile(SOUND_DIR, snd.file)
    save()
    broadcast(s, 'refresh', {})
    return send(res, 200, { server: serverView(s, user) })
  }

  // ----- Vocal -----
  if (p === '/api/ice' && method === 'GET') {
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
    if (config.turn && config.turn.urls) iceServers.push(config.turn)
    return send(res, 200, { iceServers })
  }

  if ((m = /^\/api\/voice\/([\w-]+)\/join$/.exec(p)) && method === 'POST') {
    const s = findChannelServer(user, m[1])
    const channel = channelOf(s, m[1])
    if (channel.type !== 'voice') throw bad("Ce n'est pas un salon vocal.")
    requireAccepted(s, user)
    need(s, user, 'connect')
    if (voice[m[1]] && !voice[m[1]].has(user.id) && voice[m[1]].size >= MAX_VOICE) throw bad(`Salon vocal plein (${MAX_VOICE} personnes max).`)
    if (voiceChannelOf(user.id) !== m[1]) {
      leaveVoice(user.id)
      voice[m[1]] = voice[m[1]] || new Map()
      voice[m[1]].set(user.id, { muted: !has(s, user.id, 'speak'), deafened: false, camera: false, screen: false, screenStreamId: null, recording: false })
      announceVoice(m[1])
    }
    return send(res, 200, { participants: voiceView(m[1]) })
  }

  if (p === '/api/voice/leave' && method === 'POST') {
    leaveVoice(user.id)
    return send(res, 200, { ok: true })
  }

  if (p === '/api/voice/state' && method === 'POST') {
    const cid = voiceChannelOf(user.id)
    if (!cid) throw bad("Tu n'es pas dans un salon vocal.")
    const s = serverOfChannel(cid)
    const b = await readBody(req)
    const st = voice[cid].get(user.id)
    for (const k of ['muted', 'deafened', 'camera', 'screen', 'recording']) if (typeof b[k] === 'boolean') st[k] = b[k]
    if (b.screenStreamId === null || (typeof b.screenStreamId === 'string' && b.screenStreamId.length <= 80)) st.screenStreamId = b.screenStreamId
    if (!has(s, user.id, 'speak')) st.muted = true
    if (!has(s, user.id, 'video')) st.camera = false
    if (!has(s, user.id, 'screen_share')) {
      st.screen = false
      st.screenStreamId = null
    }
    if (!has(s, user.id, 'create_clips')) st.recording = false
    if (!st.screen) st.screenStreamId = null
    announceVoice(cid)
    return send(res, 200, { ok: true })
  }

  if (p === '/api/voice/signal' && method === 'POST') {
    const cid = voiceChannelOf(user.id)
    const b = await readBody(req, 100 * 1024)
    if (!cid || typeof b.to !== 'string' || !voice[cid].has(b.to)) throw new HttpError(404, 'Participant introuvable.')
    if (!b.data || typeof b.data !== 'object') throw bad('Signal invalide.')
    for (const c of clients) if (c.userId === b.to) push(c, 'signal', { from: user.id, data: b.data })
    return send(res, 200, { ok: true })
  }

  if (p === '/api/voice/sound' && method === 'POST') {
    const cid = voiceChannelOf(user.id)
    if (!cid) throw bad("Tu n'es pas dans un salon vocal.")
    const s = serverOfChannel(cid)
    need(s, user, 'use_soundboard')
    if (voice[cid].get(user.id).deafened) throw bad('Tu es en sourdine.')
    const b = await readBody(req)
    const snd = s.sounds.find((x) => x.id === b.soundId)
    if (!snd && !BUILTIN_SOUNDS.includes(b.soundId)) throw new HttpError(404, 'Son introuvable.')
    if (Date.now() - (soundTimes.get(user.id) || 0) < 2500) throw new HttpError(429, 'Doucement avec le soundboard 🙂')
    soundTimes.set(user.id, Date.now())
    broadcast(s, 'sound', { channelId: cid, soundId: b.soundId, url: snd ? `/api/sounds/${snd.file}` : null, by: user.id })
    return send(res, 200, { ok: true })
  }

  // ----- Messages -----
  if ((m = /^\/api\/channels\/([\w-]+)\/messages$/.exec(p))) {
    const s = findChannelServer(user, m[1])
    const cid = m[1]
    const channel = channelOf(s, cid)
    if (channel.type === 'voice') throw bad('Ce salon est un salon vocal.')
    if (method === 'GET') {
      requireAccepted(s, user)
      const list = msgs[cid] || []
      let end = list.length
      const before = url.searchParams.get('before')
      if (before) {
        const i = list.findIndex((x) => x.id === before)
        if (i >= 0) end = i
      }
      const start = Math.max(0, end - 50)
      return send(res, 200, { messages: list.slice(start, end).map((x) => msgView(x, s)), hasMore: start > 0 })
    }
    if (method === 'POST') {
      const b = await readBody(req, 1200 * 1024)
      const content = typeof b.content === 'string' ? b.content.trim() : ''
      if (cpLen(content) > 2000) throw bad('Message trop long (2000 caractères max).')
      if (!content && !b.image) throw bad('Message vide.')
      checkCanPost(s, user, channel, b.image ? 'attach_files' : null)
      const image = b.image ? saveImage(String(b.image)) : null
      return send(res, 201, { message: pushMessage(s, cid, user, content, { image }) })
    }
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/clips$/.exec(p)) && method === 'POST') {
    const s = findChannelServer(user, m[1])
    const channel = channelOf(s, m[1])
    if (channel.type !== 'text') throw bad('Choisis un salon texte.')
    need(s, user, 'create_clips')
    checkCanPost(s, user, channel, 'attach_files')
    const type = String(req.headers['content-type'] || '').split(';')[0].trim()
    if (type !== 'video/webm') throw bad('Format de clip invalide (WebM attendu).')
    const buf = await readRaw(req, 30 * 1024 * 1024)
    if (buf.length < 1000) throw bad('Clip vide.')
    const file = `${uid()}.webm`
    fs.writeFileSync(path.join(CLIP_DIR, file), buf)
    const caption = freeText(decodeURIComponent(url.searchParams.get('caption') || ''), 200, 'Légende').replace(/\n/g, ' ')
    return send(res, 201, { message: pushMessage(s, m[1], user, caption, { clip: file }) })
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/messages\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
    const s = findChannelServer(user, m[1])
    const list = msgs[m[1]] || []
    const i = list.findIndex((x) => x.id === m[2])
    if (i < 0) throw new HttpError(404, 'Message introuvable.')
    const msg = list[i]
    if (msg.author !== user.id) {
      need(s, user, 'manage_messages')
      if (msg.author === s.owner) throw forbidden()
    }
    list.splice(i, 1)
    removeMessageFiles(msg)
    saveMsgs()
    broadcast(s, 'message_deleted', { channelId: m[1], id: m[2] })
    return send(res, 200, { ok: true })
  }

  if ((m = /^\/api\/channels\/([\w-]+)\/messages\/([\w-]+)\/reactions$/.exec(p)) && method === 'PUT') {
    const s = findChannelServer(user, m[1])
    requireAccepted(s, user)
    need(s, user, 'add_reactions')
    const b = await readBody(req)
    if (!EMOJIS.includes(b.emoji)) throw bad('Emoji non autorisé.')
    const msg = (msgs[m[1]] || []).find((x) => x.id === m[2])
    if (!msg) throw new HttpError(404, 'Message introuvable.')
    const users = msg.reactions[b.emoji] || []
    const i = users.indexOf(user.id)
    if (i >= 0) users.splice(i, 1)
    else {
      users.push(user.id)
      track(user, 'reactions')
    }
    if (users.length) msg.reactions[b.emoji] = users
    else delete msg.reactions[b.emoji]
    saveMsgs()
    broadcast(s, 'reaction', { channelId: m[1], id: m[2], reactions: msg.reactions })
    return send(res, 200, { ok: true })
  }

  throw new HttpError(404, 'Route inconnue.')
}

function cleanChannelName(v) {
  const s = name(v, 1, 32, 'Nom du salon').toLowerCase().replace(/\s+/g, '-')
  if (!/^[\p{L}\p{N}\p{Extended_Pictographic}_-]+$/u.test(s)) throw bad('Nom du salon : lettres, chiffres, emojis, - et _ seulement.')
  return s
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
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
  console.log('  Version         : Phase 7')
  console.log(`  Code d'inscription : ${config.codeInscription || '(aucun)'}`)
  console.log(`  Adresse locale  : http://localhost:${PORT}`)
  console.log('  Laisse cette fenêtre ouverte. Ctrl+C pour arrêter.')
  console.log('==============================================')
})
