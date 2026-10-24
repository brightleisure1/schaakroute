import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard, defaultPieces, type Arrow } from 'react-chessboard'
import { Chess, type Square } from 'chess.js'
import { needsPromotion } from '../lib/chess'
import type { Side } from '../lib/types'

export interface BoardProps {
  fen: string
  orientation: Side
  /** Kant die stukken mag bewegen; undefined = bord alleen bekijken */
  movable?: Side
  onMove?: (from: string, to: string, promotion?: string) => boolean | void
  lastMove?: [string, string] | null
  arrows?: Arrow[]
  hintSquare?: string | null
  flash?: { square: string; kind: 'good' | 'bad' | 'info' } | null
  id?: string
  animationMs?: number
  showNotation?: boolean
  /** Toegankelijke naam van het bord, bijv. "Schaakbord, je speelt wit" */
  label?: string
}

const PROMO = ['q', 'r', 'b', 'n'] as const
const PROMO_NAME: Record<string, string> = { q: 'Dame', r: 'Toren', b: 'Loper', n: 'Paard' }

/**
 * Schaakbord op basis van react-chessboard v5. Ondersteunt slepen én klikken op twee velden,
 * promotiekeuze, laatste-zet-markering, hints en pijlen. Spelregels via chess.js.
 */
// react-chessboard gebruikt het id in CSS-selectors: alleen veilige tekens toestaan
const safeId = (id: string) => 'b' + id.replace(/[^a-zA-Z0-9_-]/g, '-')

const PIECE_NAME: Record<string, string> = { k: 'koning', q: 'dame', r: 'toren', b: 'loper', n: 'paard', p: 'pion' }

/** Tekstuele beschrijving van een stelling voor schermlezers */
export function describePosition(fen: string): string {
  const c = new Chess(fen)
  const side = (color: 'w' | 'b') => {
    const pieces = c.board().flat().filter(p => p && p.color === color) as { type: string; square: string }[]
    const order = ['k', 'q', 'r', 'b', 'n', 'p']
    pieces.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    return pieces.map(p => `${PIECE_NAME[p.type]} ${p.square}`).join(', ')
  }
  return `Wit: ${side('w')}. Zwart: ${side('b')}. ${c.turn() === 'w' ? 'Wit' : 'Zwart'} aan zet.`
}

export function Board({ fen, orientation, movable, onMove, lastMove, arrows = [], hintSquare, flash, id = 'board', animationMs = 220, showNotation = true, label }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // De stukken van react-chessboard zijn focusbare 'buttons' zonder naam. Ze zijn alleen voor muis/touch;
  // toetsenbord- en schermlezergebruikers zetten via het zetinvoerveld. Haal ze daarom uit de tabvolgorde.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fix = () => el.querySelectorAll('[role="button"], [tabindex="0"]').forEach(n => {
      n.setAttribute('tabindex', '-1')
    })
    fix()
    const mo = new MutationObserver(fix)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null)
  const chess = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      return new Chess()
    }
  }, [fen])
  const turn: Side = chess.turn() === 'w' ? 'white' : 'black'
  const canMove = !!movable && movable === turn && !!onMove && !chess.isGameOver()
  const lastFen = useRef(fen)

  useEffect(() => {
    if (lastFen.current !== fen) {
      setSelected(null)
      setPromo(null)
      lastFen.current = fen
    }
  }, [fen])

  const targets = useMemo(() => {
    if (!selected || !canMove) return []
    return chess.moves({ square: selected as Square, verbose: true }).map(m => m.to)
  }, [selected, chess, canMove])

  function attempt(from: string, to: string): boolean {
    if (!canMove || !onMove) return false
    if (needsPromotion(chess, from, to)) {
      setPromo({ from, to })
      return false
    }
    setSelected(null)
    const r = onMove(from, to)
    return r !== false
  }

  function onSquareClick({ square, piece }: { square: string; piece: { pieceType: string } | null }) {
    if (!canMove) return
    if (selected && selected !== square) {
      const own = piece && piece.pieceType[0] === chess.turn()
      if (own) {
        setSelected(square)
        return
      }
      attempt(selected, square)
      setSelected(null)
      return
    }
    if (selected === square) {
      setSelected(null)
      return
    }
    if (piece && piece.pieceType[0] === chess.turn()) setSelected(square)
  }

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove[0]] = { backgroundColor: 'rgba(233, 180, 76, 0.38)' }
    squareStyles[lastMove[1]] = { backgroundColor: 'rgba(233, 180, 76, 0.5)' }
  }
  if (chess.inCheck()) {
    const king = chess.board().flat().find(p => p && p.type === 'k' && p.color === chess.turn())
    if (king) squareStyles[king.square] = { ...squareStyles[king.square], backgroundImage: 'radial-gradient(circle, rgba(220,60,50,0.75) 25%, rgba(220,60,50,0) 75%)' }
  }
  if (selected) squareStyles[selected] = { ...squareStyles[selected], backgroundColor: 'rgba(47, 125, 79, 0.45)' }
  for (const t of targets) {
    const occupied = !!chess.get(t as Square)
    squareStyles[t] = {
      ...squareStyles[t],
      backgroundImage: occupied
        ? 'radial-gradient(circle, transparent 58%, rgba(30, 80, 50, 0.45) 60%)'
        : 'radial-gradient(circle, rgba(30, 80, 50, 0.42) 18%, transparent 20%)',
      cursor: 'pointer',
    }
  }
  if (hintSquare) squareStyles[hintSquare] = { ...squareStyles[hintSquare], boxShadow: 'inset 0 0 0 4px rgba(58, 110, 165, 0.85)' }
  if (flash) {
    const color = flash.kind === 'good' ? 'rgba(47, 160, 90, 0.55)' : flash.kind === 'bad' ? 'rgba(200, 60, 50, 0.5)' : 'rgba(58, 110, 165, 0.45)'
    squareStyles[flash.square] = { ...squareStyles[flash.square], backgroundColor: color, transition: 'background-color 0.2s' }
  }

  return (
    <div className="relative w-full select-none" style={{ touchAction: 'none' }} role="group" aria-label={label ?? 'Schaakbord'}>
      <p className="sr-only" aria-live="off">{describePosition(fen)}{lastMove ? ` Laatste zet van ${lastMove[0]} naar ${lastMove[1]}.` : ''}</p>
      <div ref={wrapRef} aria-hidden="true">
      <Chessboard
        options={{
          id: safeId(id),
          position: fen,
          boardOrientation: orientation,
          allowDragging: canMove,
          canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === chess.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? attempt(sourceSquare, targetSquare) : false),
          onPieceDrag: ({ square }) => square && setSelected(square),
          onSquareClick,
          squareStyles,
          arrows,
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          animationDurationInMs: animationMs,
          showNotation,
          boardStyle: { borderRadius: '12px', overflow: 'hidden', boxShadow: '0 6px 22px rgba(30, 40, 30, 0.14)' },
          lightSquareStyle: { backgroundColor: 'var(--board-light)' },
          darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
          lightSquareNotationStyle: { color: 'var(--notation-on-light)', fontWeight: 600 },
          darkSquareNotationStyle: { color: 'var(--notation-on-dark)', fontWeight: 600 },
          dropSquareStyle: { boxShadow: 'inset 0 0 1px 5px rgba(47, 125, 79, 0.6)' },
        }}
      />
      </div>
      {promo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/35" onClick={() => setPromo(null)}>
          <div className="card flex gap-2 p-3 shadow-xl animate-pop" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setPromo(null) }} role="dialog" aria-modal="true" aria-label="Kies promotiestuk">
            {PROMO.map(p => (
              <button
                key={p}
                className="btn btn-ghost h-16 w-16 text-4xl"
                autoFocus={p === 'q'}
                title={PROMO_NAME[p]}
                aria-label={`Promoveer tot ${PROMO_NAME[p]}`}
                onClick={() => {
                  const { from, to } = promo
                  setPromo(null)
                  setSelected(null)
                  onMove?.(from, to, p)
                }}
              >
                <span aria-hidden className="block h-12 w-12">{defaultPieces[`${chess.turn()}${p.toUpperCase()}`]?.()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Klein statisch voorbeeldbord */
export function MiniBoard({ fen, orientation = 'white', id }: { fen: string; orientation?: Side; id: string }) {
  return (
    <div className="pointer-events-none w-full" inert aria-hidden="true">
      <Chessboard
        options={{
          id: safeId(id),
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          showNotation: false,
          showAnimations: false,
          boardStyle: { borderRadius: '8px', overflow: 'hidden' },
          lightSquareStyle: { backgroundColor: 'var(--board-light)' },
          darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
        }}
      />
    </div>
  )
}
