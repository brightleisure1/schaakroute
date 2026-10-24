import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Chessboard, type Arrow } from 'react-chessboard'
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
}

const PROMO = ['q', 'r', 'b', 'n'] as const
const PROMO_NAME: Record<string, string> = { q: 'Dame', r: 'Toren', b: 'Loper', n: 'Paard' }
const GLYPH: Record<string, string> = { wq: '♕', wr: '♖', wb: '♗', wn: '♘', bq: '♛', br: '♜', bb: '♝', bn: '♞' }

/**
 * Schaakbord op basis van react-chessboard v5. Ondersteunt slepen én klikken op twee velden,
 * promotiekeuze, laatste-zet-markering, hints en pijlen. Spelregels via chess.js.
 */
// react-chessboard gebruikt het id in CSS-selectors: alleen veilige tekens toestaan
const safeId = (id: string) => 'b' + id.replace(/[^a-zA-Z0-9_-]/g, '-')

export function Board({ fen, orientation, movable, onMove, lastMove, arrows = [], hintSquare, flash, id = 'board', animationMs = 220, showNotation = true }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
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
    <div className="relative w-full select-none" style={{ touchAction: 'none' }}>
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
          lightSquareNotationStyle: { color: 'var(--board-dark)', fontWeight: 600 },
          darkSquareNotationStyle: { color: 'var(--board-light)', fontWeight: 600 },
          dropSquareStyle: { boxShadow: 'inset 0 0 1px 5px rgba(47, 125, 79, 0.6)' },
        }}
      />
      {promo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/35" onClick={() => setPromo(null)}>
          <div className="card flex gap-2 p-3 shadow-xl animate-pop" onClick={e => e.stopPropagation()} role="dialog" aria-label="Kies promotiestuk">
            {PROMO.map(p => (
              <button
                key={p}
                className="btn btn-ghost h-16 w-16 text-4xl"
                title={PROMO_NAME[p]}
                aria-label={`Promoveer tot ${PROMO_NAME[p]}`}
                onClick={() => {
                  const { from, to } = promo
                  setPromo(null)
                  setSelected(null)
                  onMove?.(from, to, p)
                }}
              >
                {GLYPH[chess.turn() + p]}
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
    <div className="pointer-events-none w-full">
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
