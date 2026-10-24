import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { analyse, formatEval, whiteCp, type Analysis } from '../lib/engine'
import { parseUci } from '../lib/chess'
import { Cpu } from 'lucide-react'
import { useSettings } from './ui'

/** Optionele lokale Stockfish-evaluatie. Verschijnt alleen als de engine in de instellingen aan staat. */
export function EvalButton({ fen, label = 'Stockfish-evaluatie', multipv = 1 }: { fen: string; label?: string; multipv?: number }) {
  const settings = useSettings()
  const [state, setState] = useState<{ loading: boolean; a?: Analysis | null }>({ loading: false })
  useEffect(() => { setState({ loading: false }) }, [fen])
  if (!settings?.engineEnabled) return null
  const run = async () => {
    setState({ loading: true })
    const a = await analyse(fen, { depth: 14, multipv })
    setState({ loading: false, a })
  }
  if (!state.a && !state.loading) return <button className="btn btn-ghost min-h-11 w-full text-sm" onClick={run}><Cpu size={16} aria-hidden />{label}</button>
  if (state.loading) return <div className="text-sm text-muted">Stockfish rekent (lokaal)…</div>
  if (!state.a) return <div className="text-sm text-muted">Stockfish kon niet laden. De training werkt gewoon verder zonder engine.</div>
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-sm">
      <div className="text-xs text-muted">Stockfish 19 lite (lokaal, diepte {state.a.lines[0]?.depth}) — objectieve evaluatie, vanuit wit</div>
      {state.a.lines.map(l => (
        <div key={l.multipv} className="mt-1 flex gap-2 font-mono">
          <b className="w-12 shrink-0">{formatEval(whiteCp(l, fen))}</b>
          <span className="truncate text-muted">{pvToSan(fen, l.pv.slice(0, 6))}</span>
        </div>
      ))}
    </div>
  )
}

function pvToSan(fen: string, pv: string[]) {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of pv) {
    try { out.push(c.move(parseUci(u)).san) } catch { break }
  }
  return out.join(' ')
}
