import type { CSSProperties } from 'react'

export const FONTS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  cursive: '"Comic Sans MS", "Brush Script MT", cursive',
}

export function nameStyle(color: string, font: string, effect: string): CSSProperties {
  const base: CSSProperties = { fontFamily: FONTS[font] ?? FONTS.sans, fontWeight: 700 }
  if (effect === 'glow') return { ...base, color, textShadow: `0 0 8px ${color}, 0 0 16px ${color}` }
  if (effect === 'gradient')
    return {
      ...base,
      backgroundImage: `linear-gradient(90deg, ${color}, #ff4ecd)`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    }
  return { ...base, color }
}

export const STATUSES = [
  { id: 'online', label: 'En ligne', color: '#23a55a' },
  { id: 'idle', label: 'Inactif', color: '#f0b232' },
  { id: 'dnd', label: 'Ne pas déranger', color: '#f23f43' },
  { id: 'invisible', label: 'Invisible', color: '#80848e' },
  { id: 'offline', label: 'Hors ligne', color: '#80848e' },
] as const

export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? ''
