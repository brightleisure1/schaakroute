import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Circle, CircleCheck } from 'lucide-react'

// Keuze-onderdelen uit ontwerpronde 10: kiezen in plaats van invullen. Allemaal echte radioknoppen
// (pijltjestoetsen werken, schermlezers horen "keuzerondje, 1 van 3"), alleen anders aangekleed.

const focusRing = 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand'

export interface ChoiceOption<T extends string> {
  value: T
  label: ReactNode
  hint?: ReactNode
}

/** Segmentknop: twee tot vier korte keuzes naast elkaar in één balk */
export function Segmented<T extends string>({ name, label, value, onChange, options }: { name: string; label: string; value: T; onChange: (v: T) => void; options: ChoiceOption<T>[] }) {
  return (
    <fieldset className="flex min-w-0 gap-0.5 rounded-[14px] border border-line bg-surface-2 p-1">
      <legend className="sr-only">{label}</legend>
      {options.map(o => {
        const on = value === o.value
        return (
          <label key={o.value} className={`flex min-h-11 min-w-0 flex-1 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-[10px] px-2 text-sm transition ${focusRing} ${on ? 'bg-surface font-bold text-ink shadow-[0_1px_2px_rgba(31,42,36,0.14)]' : 'font-medium text-muted hover:text-ink'}`}>
            <input type="radio" className="sr-only" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        )
      })}
    </fieldset>
  )
}

/** Keuzekaarten onder elkaar (of naast elkaar op een breed scherm): de gekozen kaart is groen met een vinkje */
export function ChoiceCards<T extends string>({ name, label, value, onChange, options, disabled, className = '' }: { name: string; label: string; value: T; onChange: (v: T) => void; options: ChoiceOption<T>[]; disabled?: boolean; className?: string }) {
  return (
    <fieldset className={`grid min-w-0 gap-2.5 ${className}`} disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {options.map(o => {
        const on = value === o.value
        return (
          <label key={o.value} className={`tap flex min-h-11 cursor-pointer select-none items-center gap-3 px-3.5 py-3 ${focusRing} ${on ? 'tap-on' : ''}`}>
            <input type="radio" className="sr-only" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{o.label}</span>
              {o.hint && <span className={`block text-[13px] ${on ? 'text-brand-strong' : 'text-muted'}`}>{o.hint}</span>}
            </span>
            {on
              ? <CircleCheck size={22} strokeWidth={2.25} aria-hidden className="shrink-0 text-brand" />
              : <Circle size={22} strokeWidth={2} aria-hidden className="shrink-0 text-line dark:text-muted/50" />}
          </label>
        )
      })}
    </fieldset>
  )
}

/** Groot invoerveld met een icoon ervoor; het label is voor schermlezers (de placeholder zegt het al) */
export function IconField({ icon, label, className = '', ...props }: { icon: ReactNode; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={`flex min-h-[3.125rem] items-center gap-2.5 rounded-[14px] border-2 border-line bg-surface px-3.5 text-muted transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 ${className}`}>
      <span aria-hidden className="flex shrink-0">{icon}</span>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} className="min-w-0 flex-1 self-stretch bg-transparent text-base text-ink focus-visible:outline-none!" {...props} />
    </div>
  )
}

/** Bestandskiezer in dezelfde vorm als IconField: toont de gekozen bestandsnaam */
export function FileField({ icon, label, fileName, placeholder, accept, onFile, disabled }: { icon: ReactNode; label: string; fileName?: string; placeholder: string; accept?: string; onFile: (f: File | undefined) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-[3.125rem] cursor-pointer items-center gap-2.5 rounded-[14px] border-2 border-line bg-surface px-3.5 text-muted transition hover:border-brand focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <span aria-hidden className="flex shrink-0">{icon}</span>
      <span className={`min-w-0 flex-1 truncate ${fileName ? 'text-ink' : ''}`}>{fileName ?? placeholder}</span>
      <input type="file" className="sr-only" aria-label={label} accept={accept} disabled={disabled} onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}

/** Klein briefje met een icoon (bijv. een slotje bij een privacy-opmerking) */
export function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-2 text-[13px] leading-snug text-muted">
      <span aria-hidden className="mt-0.5 flex shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  )
}
