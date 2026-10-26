import { Chess, type Square } from 'chess.js'
import { defaultPieces } from 'react-chessboard'
import { cropWindow, fenFromEpd } from '../lib/chess'
import type { Side } from '../lib/types'

/**
 * Klein bordje met alleen de 4×4 velden waar de beginzetten van een opening gebeuren.
 * Het veld van de kenmerkende zet licht goud op. Decoratief: de zetten staan ernaast als tekst.
 */
export function CropBoard({ epd, uci, orientation, inset = 3, coordsFrom }: { epd: string; uci: string[]; orientation: Side; inset?: number; coordsFrom?: 'lg' | 'never' }) {
  // Coördinaten weglaten op bordjes die te klein zijn (alleen op de telefoon, of helemaal)
  const coordCls = coordsFrom === 'never' ? ' hidden' : coordsFrom === 'lg' ? ' max-lg:hidden' : ''
  const { files, ranks, highlight } = cropWindow(uci)
  const game = new Chess(fenFromEpd(epd))
  const fs = orientation === 'white' ? [...files] : [...files].reverse()
  const rs = orientation === 'white' ? [...ranks].reverse() : ranks
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-lg" aria-hidden="true">
      {rs.flatMap((r, ri) => fs.map((f, fi) => {
        const sq = `${f}${r}` as Square
        const light = ('abcdefgh'.indexOf(f) + r) % 2 === 0
        const piece = game.get(sq)
        const coord = { color: light ? 'var(--notation-on-light)' : 'var(--notation-on-dark)' }
        return (
          <div key={sq} className="relative aspect-square" style={{ background: highlight.includes(sq) ? (light ? 'var(--board-hl-light)' : 'var(--board-hl-dark)') : light ? 'var(--board-light)' : 'var(--board-dark)' }}>
            {piece && defaultPieces[piece.color + piece.type.toUpperCase()]({ svgStyle: { width: '100%', height: '100%', display: 'block' } })}
            {fi === 0 && <span className={`absolute text-[10px] font-bold leading-none${coordCls}`} style={{ ...coord, left: inset, top: inset - 1 }}>{r}</span>}
            {ri === 3 && <span className={`absolute text-[10px] font-bold leading-none${coordCls}`} style={{ ...coord, right: inset, bottom: inset - 1 }}>{f}</span>}
          </div>
        )
      }))}
    </div>
  )
}
