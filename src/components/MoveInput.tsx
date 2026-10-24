import { useId, useState, type FormEvent } from 'react'
import { Chess, type Move } from 'chess.js'
import { Keyboard } from 'lucide-react'

/**
 * Zet invoeren met het toetsenbord (Lichess-notatie, bijv. Nf3, exd5, O-O, e8=Q, of e2e4).
 * Maakt het bord volledig bruikbaar zonder muis of touch, ook met een schermlezer.
 */
export function MoveInput({ fen, enabled, onMove, className = '' }: { fen: string; enabled: boolean; onMove: (from: string, to: string, promotion?: string) => boolean | void; className?: string }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  function parse(text: string): Move | null {
    const tryMove = (m: string | { from: string; to: string; promotion?: string }) => {
      try {
        return new Chess(fen).move(m)
      } catch {
        return null
      }
    }
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(text)) {
      const t = text.toLowerCase()
      return tryMove({ from: t.slice(0, 2), to: t.slice(2, 4), promotion: t[4] })
    }
    const normalized = text.replace(/0/g, 'O').replace(/^o-o/i, m => m.toUpperCase())
    return tryMove(normalized) ?? tryMove(normalized[0].toUpperCase() + normalized.slice(1))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = value.trim()
    if (!text || !enabled) return
    const mv = parse(text)
    if (!mv) {
      setError(`"${text}" is geen legale zet in deze stelling.`)
      return
    }
    setError(null)
    setValue('')
    onMove(mv.from, mv.to, mv.promotion)
  }

  return (
    <form onSubmit={submit} className={`mt-2 ${className}`}>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">Typ je zet in Lichess-notatie</label>
        <Keyboard size={18} aria-hidden className="shrink-0 text-muted" />
        <input
          id={id}
          className="input min-h-11 py-2 text-sm"
          placeholder={enabled ? 'Of typ je zet, bijv. Nf3' : 'Wacht op je beurt…'}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          readOnly={!enabled}
          aria-disabled={!enabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button type="submit" className="btn btn-ghost min-h-11" disabled={!enabled || !value.trim()}>Zet</button>
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger-ink">{error}</p>}
    </form>
  )
}
