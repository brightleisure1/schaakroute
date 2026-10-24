// Optionele lokale Stockfish-analyse (GPLv3, zie public/engine/SOURCE.md) in een Web Worker.
// Alles werkt ook als de engine niet laadt: iedere functie geeft dan null terug.

export interface EngineLine {
  multipv: number
  depth: number
  cp?: number // centipawns vanuit het perspectief van de kant aan zet
  mate?: number
  pv: string[]
}

export interface Analysis {
  fen: string
  bestmove: string | null
  lines: EngineLine[]
}

const ENGINE_URL = import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js'

let worker: Worker | null = null
let readyPromise: Promise<boolean> | null = null
let chain: Promise<unknown> = Promise.resolve()
let failed = false

function boot(): Promise<boolean> {
  if (failed) return Promise.resolve(false)
  if (readyPromise) return readyPromise
  readyPromise = new Promise<boolean>(resolve => {
    try {
      worker = new Worker(ENGINE_URL)
    } catch {
      failed = true
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      failed = true
      worker?.terminate()
      worker = null
      resolve(false)
    }, 15000)
    worker.onerror = () => {
      clearTimeout(timer)
      failed = true
      resolve(false)
    }
    worker.onmessage = e => {
      if (String(e.data).includes('uciok')) {
        worker!.postMessage('isready')
      } else if (String(e.data).includes('readyok')) {
        clearTimeout(timer)
        resolve(true)
      }
    }
    worker.postMessage('uci')
  })
  return readyPromise
}

export function engineStatus(): 'idle' | 'ready' | 'failed' {
  if (failed) return 'failed'
  return worker ? 'ready' : 'idle'
}

export function analyse(fen: string, opts: { depth?: number; multipv?: number; movetime?: number; moves?: string[] } = {}): Promise<Analysis | null> {
  const run = async (): Promise<Analysis | null> => {
    if (!(await boot()) || !worker) return null
    const w = worker
    return new Promise<Analysis | null>(resolve => {
      const lines = new Map<number, EngineLine>()
      const timeout = setTimeout(() => {
        w.postMessage('stop')
      }, (opts.movetime ?? 4000) + 4000)
      w.onmessage = e => {
        const line = String(e.data)
        if (line.startsWith('info') && line.includes(' pv ')) {
          const get = (k: string) => line.match(new RegExp(`\\b${k} (-?\\d+)`))?.[1]
          const multipv = Number(get('multipv') ?? 1)
          const cp = get('score cp')
          const mate = get('score mate')
          lines.set(multipv, {
            multipv,
            depth: Number(get('depth') ?? 0),
            cp: cp !== undefined ? Number(cp) : undefined,
            mate: mate !== undefined ? Number(mate) : undefined,
            pv: line.split(' pv ')[1].trim().split(' '),
          })
        } else if (line.startsWith('bestmove')) {
          clearTimeout(timeout)
          const best = line.split(' ')[1]
          resolve({ fen, bestmove: best && best !== '(none)' ? best : null, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) })
        }
      }
      w.postMessage(`setoption name MultiPV value ${opts.multipv ?? 1}`)
      w.postMessage(`position fen ${fen}${opts.moves?.length ? ' moves ' + opts.moves.join(' ') : ''}`)
      w.postMessage(opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`)
    })
  }
  const p = chain.then(run, run)
  chain = p.catch(() => null)
  return p
}

/** Score in centipawns vanuit wit, voor weergave (mat = ±10000) */
export function whiteCp(line: EngineLine | undefined, fen: string): number | null {
  if (!line) return null
  const stm = fen.split(' ')[1] === 'w' ? 1 : -1
  if (line.mate !== undefined) return stm * Math.sign(line.mate || 1) * 10000
  return line.cp !== undefined ? stm * line.cp : null
}

export function formatEval(cpWhite: number | null): string {
  if (cpWhite === null) return '–'
  if (Math.abs(cpWhite) >= 10000) return cpWhite > 0 ? '#+' : '#−'
  const v = cpWhite / 100
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1)
}

/**
 * Vergelijkt de gespeelde zet met de beste zet: hoeveel centipawns verliest de speler?
 * Geeft null als de engine niet beschikbaar is.
 */
export async function moveLoss(fenBefore: string, playedUci: string): Promise<{ loss: number; best: string | null; bestCp: number | null; playedCp: number | null } | null> {
  const best = await analyse(fenBefore, { depth: 12 })
  if (!best?.lines[0]) return null
  const played = await analyse(fenBefore, { depth: 11, moves: [playedUci] })
  if (!played?.lines[0]) return null
  const toCp = (l: EngineLine) => (l.mate !== undefined ? Math.sign(l.mate || 1) * 10000 : l.cp ?? 0)
  const bestCp = toCp(best.lines[0])
  const playedCp = -toCp(played.lines[0]) // na de zet is de tegenstander aan zet
  return { loss: Math.max(0, bestCp - playedCp), best: best.bestmove, bestCp, playedCp }
}
