import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChessKnight, Star, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS, type UserSettings } from '../lib/db'
import type { BadgeDef } from '../lib/gamification'

export function useSettings(): UserSettings | undefined {
  return useLiveQuery(async () => (await db.settings.get('me')) ?? { ...DEFAULT_SETTINGS }, [])
}

export function ProgressBar({ value, className = '', tone = 'brand', label }: { value: number; className?: string; tone?: 'brand' | 'accent' | 'info'; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const color = tone === 'accent' ? 'bg-accent' : tone === 'info' ? 'bg-info' : 'bg-brand'
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-2 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const STAR_PX: Record<string, number> = { 'text-sm': 14, 'text-base': 16, 'text-2xl': 24, 'text-3xl': 30 }
export function Stars({ count, max = 3, size = 'text-base' }: { count: number; max?: number; size?: string }) {
  const px = STAR_PX[size] ?? 16
  return (
    <span className="inline-flex gap-0.5 align-middle" role="img" aria-label={`${count} van ${max} sterren`}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={px} strokeWidth={2} aria-hidden className={i < count ? 'fill-star text-star' : 'text-star-empty'} />
      ))}
    </span>
  )
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-1 inline-block text-sm text-muted hover:text-ink">← Terug</Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-muted">{icon && <span aria-hidden className="text-brand-strong">{icon}</span>}{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <ChessKnight size={32} strokeWidth={1.5} aria-hidden className="text-muted" />
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div className="card border-danger bg-danger-soft p-4 text-sm text-danger-ink">{String((error as Error)?.message ?? error)}</div>
}

const CONFETTI_COLORS = ['#2f7d4f', '#d99a2b', '#e9b44c', '#3a6ea5', '#c0453a', '#8fae86']
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; delay: number; color: string; rot: number }[]>([])
  useEffect(() => {
    if (!fire) return
    const ps = Array.from({ length: 40 }, (_, i) => ({ id: fire * 100 + i, left: Math.random() * 100, delay: Math.random() * 0.4, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], rot: Math.random() * 360 }))
    setPieces(ps)
    const t = setTimeout(() => setPieces([]), 2400)
    return () => clearTimeout(t)
  }, [fire])
  return (
    <>
      {pieces.map(p => (
        <span key={p.id} className="confetti-piece" style={{ left: `${p.left}vw`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1" role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function pct(v: number, digits = 0) {
  const min = 10 ** -digits / 100
  if (v > 0 && v < min) return `<${(min * 100).toFixed(digits).replace('.', ',')}%` // nooit "0,0%" voor iets dat wel voorkomt
  return `${(v * 100).toFixed(digits).replace('.', ',')}%`
}

/** Nederlands meervoud: plural(1, 'fout', 'fouten') → "1 fout" */
export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('nl-NL')} ${n === 1 ? one : many}`
}

export function nf(v: number) {
  return v.toLocaleString('nl-NL')
}

export const sideLabel = (s: 'white' | 'black') => (s === 'white' ? 'Wit' : 'Zwart')

/** Op kleine schermen blijft de hoofdactie onderin beeld staan, ook als het bord de kaart naar beneden duwt */
export const STICKY_ACTIONS = 'max-lg:sticky max-lg:bottom-(--bottom-nav,0px) max-lg:z-10 max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-lg:bg-surface/95 max-lg:backdrop-blur'

/** Felicitatie voor nieuw verdiende badges: compact, met het badge-icoon als medaille */
export function BadgesEarned({ badges, className = '' }: { badges: BadgeDef[]; className?: string }) {
  if (!badges.length) return null
  return (
    <ul className={`grid gap-2 ${className}`} role="status">
      {badges.map(b => (
        <li key={b.id} className="flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-2 text-left animate-pop">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-accent bg-surface text-accent-ink shadow-sm">
            <b.icon size={18} strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-accent-ink">Nieuwe badge</span>
            <span className="block text-sm font-semibold leading-tight">{b.title}</span>
            <span className="block text-xs text-muted">{b.description}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Zet de trainingsfocus aan of uit (App luistert): tijdens het trainen geen tabbalk en geen kopbalk op de telefoon */
export const FocusContext = createContext<(on: boolean) => void>(() => {})

/** Trainingsfocus zolang `active` waar is, bijvoorbeeld zolang er een bord gespeeld wordt */
export function useTrainingFocus(active: boolean) {
  const setFocus = useContext(FocusContext)
  useEffect(() => {
    setFocus(active)
    return () => setFocus(false)
  }, [active, setFocus])
}

/** Bovenbalk tijdens het trainen: stoppen, voortgang en teller (zoals in Duolingo) */
export function FocusBar({ value, count, onClose, closeLabel, sub }: { value: number; count: string; onClose: () => void; closeLabel: string; sub?: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-3 bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      <button className="btn btn-quiet -ml-2 h-11 w-11 shrink-0 p-0" onClick={onClose} aria-label={closeLabel} title={closeLabel}><X size={22} aria-hidden /></button>
      <div className="min-w-0 flex-1">
        <ProgressBar value={value} label="Voortgang" />
        {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{count}</span>
    </div>
  )
}
