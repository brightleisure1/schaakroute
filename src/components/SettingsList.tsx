import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { BusyKnight } from './PieceMotion'

// Gegroepeerde lijst in de stijl van iOS-instellingen (ontwerp ronde 10): een kopje per groep,
// rijen met een gekleurd icoontegeltje, label, waarde rechts en een pijltje.

export type Tone = 'brand' | 'accent' | 'info' | 'danger' | 'neutral'

const TONE: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-strong',
  accent: 'bg-accent-soft text-accent-ink',
  info: 'bg-info-soft text-info-ink',
  danger: 'bg-danger-soft text-danger-ink',
  neutral: 'bg-surface-2 text-ink',
}

/** Klein gekleurd tegeltje met een icoon (decoratief) */
export function IconTile({ icon: Icon, tone = 'neutral', size = 'md', busy }: { icon: LucideIcon; tone?: Tone; size?: 'md' | 'lg'; busy?: boolean }) {
  const box = size === 'lg' ? 'h-9 w-9' : 'h-[34px] w-[34px]'
  const px = size === 'lg' ? 18 : 17
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-[10px] ${box} ${TONE[tone]}`}>
      {/* Bezig (ontwerp 13e): het icoon wordt een wiegend paard, even groot */}
      {busy ? <BusyKnight size={px + 3} /> : <Icon size={px} strokeWidth={2.25} />}
    </span>
  )
}

export function SettingsGroup({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  const id = `groep-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-xs font-bold uppercase tracking-[0.04em] text-muted">{title}</h2>
      <div className="overflow-hidden rounded-[18px] border-2 border-line bg-surface [&>*+*]:border-t-2 [&>*+*]:border-surface-2">
        {children}
      </div>
      {footer && <div className="px-1 text-xs leading-relaxed text-muted">{footer}</div>}
    </section>
  )
}

const ROW = 'flex w-full min-h-14 items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-offset-[-2px]'

function RowBody({ icon, tone, label, sub, value, danger, busy, chevron = 'right' }: RowProps & { chevron?: 'right' | 'down' | 'none' }) {
  return (
    <>
      <IconTile icon={icon} tone={tone} busy={busy} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold ${danger ? 'text-danger-ink' : 'text-ink'}`}>{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      {value != null && value !== '' && <span className="shrink-0 text-right text-sm text-muted tabular-nums">{value}</span>}
      {chevron !== 'none' && (
        <ChevronRight size={16} strokeWidth={2.25} aria-hidden className={`shrink-0 text-star-empty transition-transform ${chevron === 'down' ? 'rotate-90' : ''}`} />
      )}
    </>
  )
}

interface RowProps {
  icon: LucideIcon
  tone?: Tone
  label: ReactNode
  sub?: ReactNode
  value?: ReactNode
  danger?: boolean
  /** Bezig met iets wat even duurt: wiegend paard in plaats van het icoon */
  busy?: boolean
}

/** Rij die een paneel eronder open- en dichtklapt */
export function ExpandRow({ id, open, onToggle, children, ...row }: RowProps & { id: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div>
      <button type="button" className={ROW} aria-expanded={open} aria-controls={`${id}-paneel`} id={`${id}-rij`} onClick={onToggle}>
        <RowBody {...row} chevron={open ? 'down' : 'right'} />
      </button>
      {open && (
        <div id={`${id}-paneel`} role="region" aria-labelledby={`${id}-rij`} className="animate-fade-in px-3.5 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

/** Rij die naar een ander scherm gaat */
export function LinkRow({ to, ...row }: RowProps & { to: string }) {
  return <Link to={to} className={ROW}><RowBody {...row} /></Link>
}

/** Rij die direct iets doet */
export function ActionRow({ onClick, ...row }: RowProps & { onClick: () => void }) {
  return <button type="button" className={`${ROW} ${row.busy ? 'cursor-progress' : ''}`} onClick={onClick} disabled={row.busy} aria-busy={row.busy}><RowBody {...row} /></button>
}

/** Rij die een bestand laat kiezen */
export function FileRow({ accept, onFile, ...row }: RowProps & { accept: string; onFile: (f: File) => void }) {
  return (
    <label className={`${ROW} ${row.busy ? 'cursor-progress' : 'cursor-pointer'} focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-brand`} aria-busy={row.busy}>
      <RowBody {...row} />
      <input type="file" accept={accept} className="sr-only" disabled={row.busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
    </label>
  )
}

/** Rij die zelf een aan/uit-schakelaar is (role="switch"): de hele rij is het tikdoel */
export function SwitchRow({ checked, onChange, ...row }: RowProps & { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={ROW} onClick={() => onChange(!checked)}>
      <RowBody {...row} value={undefined} chevron="none" />
      <span aria-hidden className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line ring-1 ring-inset ring-muted/40'}`}>
        <span className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
      </span>
    </button>
  )
}
