import { useEffect, useState } from 'react'
import * as api from '../lib/api'

export default function AccountTab() {
  const [st, setSt] = useState<{ linked: boolean; email: string | null; googleOnly: boolean } | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    api.googleStatus().then(setSt).catch(() => {})
    api.ping(api.getServerAddress()).then((p) => setEnabled(Boolean(p.google))).catch(() => {})
  }
  useEffect(load, [])

  return (
    <div>
      <label>Connexion avec Google</label>
      {!enabled && <p className="muted">Le propriétaire du serveur n&apos;a pas activé Google (voir serveur/LISEZMOI.txt).</p>}
      {st?.linked ? (
        <>
          <p>✅ Lié à <b>{st.email}</b></p>
          {st.googleOnly
            ? <p className="muted">Ce compte a été créé avec Google et n&apos;a pas de mot de passe.</p>
            : <button className="danger" onClick={async () => { try { await api.googleUnlink(); setMsg({ ok: true, text: 'Google délié.' }); load() } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' }) } }}>Délier Google</button>}
        </>
      ) : (
        enabled && (
          <button disabled={busy} onClick={async () => {
            setBusy(true)
            setMsg({ ok: true, text: "Une page Google s'est ouverte dans ton navigateur : connecte-toi puis reviens ici…" })
            try { await api.googleFlow({ link: true }); setMsg({ ok: true, text: 'Compte Google lié ✅' }); load() } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Erreur' }) }
            setBusy(false)
          }}>🔵 Lier mon compte Google</button>
        )
      )}
      <p className="muted">Seuls l&apos;identifiant Google et ton adresse e-mail sont gardés sur ton serveur (pour te reconnaître). Jamais ton mot de passe Google.</p>
      {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
    </div>
  )
}
