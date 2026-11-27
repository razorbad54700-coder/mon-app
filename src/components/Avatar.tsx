import { STATUSES } from '../lib/nameStyle'

export default function Avatar({
  url, name, status, size = 44, frame,
}: { url: string | null; name: string; status?: string; size?: number; frame?: string | null }) {
  const color = STATUSES.find((s) => s.id === status)?.color
  return (
    <div className={'avatar' + (frame ? ' ' + frame : '')} style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <div className="ph" style={{ fontSize: size / 2.5 }}>{name.charAt(0).toUpperCase()}</div>}
      {color && <span className="dot" style={{ background: color }} />}
    </div>
  )
}
