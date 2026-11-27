import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import Avatar from '../components/Avatar'
import { fxClass, nameStyle } from '../lib/nameStyle'

type Tab = 'shop' | 'quests' | 'badges' | 'inv'
const SLOT_LABEL: Record<api.ShopItem['slot'], string> = { frame: 'Cadres d’avatar', banner_fx: 'Effets de bannière', name_fx: 'Effets de pseudo', title: 'Titres' }

export default function ShopPage() {
  const { profile, update } = useAuth()
  const [eco, setEco] = useState<api.Economy | null>(null)
  const [tab, setTab] = useState<Tab>('shop')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.getEconomy().then(setEco).catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' }))
  }, [])
  if (!profile) return null

  async function run(fn: () => Promise<api.Economy | { reward: number; economy: api.Economy }>, ok?: (r: never) => string) {
    try {
      const r = await fn()
      const e = 'economy' in r ? r.economy : r
      setEco(e)
      setMsg({ ok: true, text: ok ? ok(r as never) : 'OK ✅' })
      await update({}) // rafraîchit le profil (cadre, titre…)
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Erreur' })
    }
  }

  const eq = eco?.equipped ?? {}
  const item = (id?: string) => eco?.shop.find((i) => i.id === id)

  return (
    <div className="center" style={{ alignItems: 'start' }}>
      <div className="card wide">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>🪙 {eco?.coins ?? '…'}</h1>
          <Link to="/"><button className="ghost small">Retour</button></Link>
        </div>

        <div className="preview row" style={{ marginTop: 14 }}>
          <Avatar url={profile.avatar_url} name={profile.username} size={64} frame={profile.frame} />
          <div>
            <div className={fxClass(profile.name_fx)} style={{ fontSize: 20, ...nameStyle(profile.name_color, profile.name_font, profile.name_effect) }}>{profile.username}</div>
            {profile.title && <span className="title-tag">{profile.title}</span>}
          </div>
        </div>

        {eco && (
          <button className="full" disabled={!eco.daily.canClaim} onClick={() => void run(api.claimDaily, (r: { reward: number }) => `+${r.reward} 🪙 !`)}>
            {eco.daily.canClaim ? `🎁 Récompense du jour : +${eco.daily.reward} 🪙` : `✅ Récompense récupérée (série : ${eco.daily.streak} jour${eco.daily.streak > 1 ? 's' : ''})`}
          </button>
        )}

        <div className="tabs">
          {([['shop', '🛍 Boutique'], ['quests', '📜 Quêtes'], ['badges', '🏅 Badges'], ['inv', '🎒 Inventaire']] as [Tab, string][]).map(([id, l]) => (
            <button key={id} className={tab === id ? '' : 'ghost'} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {eco && tab === 'shop' && (['frame', 'banner_fx', 'name_fx', 'title'] as const).map((slot) => (
          <div key={slot}>
            <div className="section-title" style={{ marginTop: 12 }}><span>{SLOT_LABEL[slot].toUpperCase()}</span></div>
            <div className="shop-grid">
              {eco.shop.filter((i) => i.slot === slot).map((i) => {
                const owned = eco.inventory.includes(i.id)
                return (
                  <div key={i.id} className="shop-item">
                    <Preview item={i} name={profile.username} avatar={profile.avatar_url} />
                    <div className="ellipsis" title={i.name}>{i.emoji} {i.name}</div>
                    {owned ? <button className="small ghost" disabled>Possédé</button>
                      : <button className="small" disabled={eco.coins < i.price} onClick={() => void run(() => api.buyItem(i.id), () => `Acheté : ${i.name} ✅`)}>{i.price} 🪙</button>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {eco && tab === 'quests' && (
          <div>
            <p className="muted">3 nouvelles quêtes chaque jour. Le vocal compte seulement à plusieurs, et pas en sourdine.</p>
            {eco.quests.map((q) => (
              <div key={q.id} className="quest">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{q.label}</span><b>+{q.reward} 🪙</b>
                </div>
                <div className="bar"><div style={{ width: `${(q.progress / q.goal) * 100}%` }} /></div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">{q.progress} / {q.goal}</span>
                  <button className="small" disabled={q.claimed || q.progress < q.goal} onClick={() => void run(() => api.claimQuest(q.id), (r: { reward: number }) => `+${r.reward} 🪙 !`)}>
                    {q.claimed ? 'Récupérée ✅' : 'Récupérer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {eco && tab === 'badges' && (
          <div className="shop-grid">
            {eco.badges.map((b) => (
              <div key={b.id} className={'shop-item' + (b.earned ? '' : ' locked')}>
                <div style={{ fontSize: 34 }}>{b.emoji}</div>
                <b>{b.name}</b>
                <span className="muted">{b.desc}</span>
                <span className="muted">{b.earned ? '✅ Obtenu' : b.bonus ? `Récompense : ${b.bonus} 🪙` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {eco && tab === 'inv' && (
          <div>
            {eco.inventory.length === 0 && <p className="muted">Ton inventaire est vide : va faire un tour à la boutique.</p>}
            {(['frame', 'banner_fx', 'name_fx', 'title'] as const).map((slot) => {
              const mine = eco.shop.filter((i) => i.slot === slot && eco.inventory.includes(i.id))
              if (!mine.length) return null
              return (
                <div key={slot}>
                  <div className="section-title" style={{ marginTop: 12 }}><span>{SLOT_LABEL[slot].toUpperCase()}</span></div>
                  <div className="shop-grid">
                    {mine.map((i) => (
                      <div key={i.id} className="shop-item">
                        <Preview item={i} name={profile.username} avatar={profile.avatar_url} />
                        <div className="ellipsis">{i.emoji} {i.name}</div>
                        {eq[slot] === i.id
                          ? <button className="small ghost" onClick={() => void run(() => api.equipItem(slot, null), () => 'Retiré')}>Retirer</button>
                          : <button className="small" onClick={() => void run(() => api.equipItem(slot, i.id), () => `${i.name} équipé ✅`)}>Équiper</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {item(eq.title) && null}
          </div>
        )}

        {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
      </div>
    </div>
  )
}

function Preview({ item, name, avatar }: { item: api.ShopItem; name: string; avatar: string | null }) {
  if (item.slot === 'frame') return <Avatar url={avatar} name={name} size={56} frame={item.id} />
  if (item.slot === 'banner_fx') return <div className={'banner-img ' + item.id} style={{ height: 56, margin: 0, borderRadius: 8 }} />
  if (item.slot === 'name_fx') return <div className={'fx ' + item.id} style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>{name}</div>
  return <span className="title-tag">{item.value}</span>
}
