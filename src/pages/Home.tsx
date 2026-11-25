import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Status } from '../lib/store'
import Avatar from '../components/Avatar'
import { STATUSES, nameStyle } from '../lib/nameStyle'

export default function Home() {
  const { profile, update, signOut } = useAuth()
  if (!profile) return null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">MonApp</div>
        <div className="me">
          <div className="row">
            <Avatar url={profile.avatar_url} name={profile.username} status={profile.status} />
            <div style={{ minWidth: 0 }}>
              <div style={nameStyle(profile.name_color, profile.name_font, profile.name_effect)}>{profile.username}</div>
              <div className="muted">{STATUSES.find((s) => s.id === profile.status)?.label}</div>
            </div>
          </div>
          <select style={{ marginTop: 10 }} value={profile.status} onChange={(e) => update({ status: e.target.value as Status })}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="row" style={{ marginTop: 10 }}>
            <Link to="/profile"><button className="ghost">Mon profil</button></Link>
            <button className="ghost" onClick={signOut}>Déconnexion</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <h1 style={{ textAlign: 'left' }}>Bienvenue, {profile.username} 👋</h1>
        <p className="muted">
          Version locale : ton compte est enregistré sur cet appareil uniquement. Les comptes en ligne, les messages
          entre utilisateurs et le vocal demanderont un serveur (phases suivantes).
        </p>

        <h2 style={{ marginTop: 28 }}>Feuille de route</h2>
        <ul className="roadmap">
          <li>✅ Phase 1 : compte pseudo + mot de passe, profil, statuts</li>
          <li>⏳ Phase 2 : serveur en ligne, serveurs, salons, rôles, invitations</li>
          <li>⏳ Phase 3 : messages en temps réel, images, réactions</li>
          <li>⏳ Phase 4 : salons vocaux, muet / sourdine, caméra</li>
          <li>⏳ Phase 5 : partage d&apos;écran, soundboard, clips</li>
          <li>⏳ Phase 6 : monnaie virtuelle, quêtes, boutique, badges, profil animé</li>
          <li>⏳ Phase 7 : collection de jeux</li>
        </ul>
      </main>
    </div>
  )
}
