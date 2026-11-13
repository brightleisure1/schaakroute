import { useId, type ReactNode } from 'react'
import { BookOpen, Check, ThumbsUp, X } from 'lucide-react'
import { CLASS_INFO, type MoveClass } from '../lib/review'

// Icoontjes voor de zetbeoordeling: een rond schildje met een zachte glans en een wit teken.
// Alles is getekend in SVG (geen emoji of lettertype), zodat ze op ieder apparaat er hetzelfde uitzien.

/** Meng een hex-kleur met wit (t = 0..1) */
function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

/** Uitroepteken met het midden op x, binnen een 32×32-veld */
const Bang = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 16) scale(${s}) translate(0 -16)`}>
    <rect x={-2} y={6.5} width={4} height={12} rx={2} stroke="none" />
    <circle cx={0} cy={23.4} r={2.25} stroke="none" />
  </g>
)

/** Vraagteken met het midden op x */
const Ask = ({ x, s = 1 }: { x: number; s?: number }) => (
  <g transform={`translate(${x} 16) scale(${s}) translate(-16 -16)`}>
    <path d="M11.4 11.6a4.6 4.6 0 1 1 6.5 4.2c-1.2.55-1.9 1.5-1.9 2.8v.4" fill="none" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={16} cy={23.4} r={2.25} stroke="none" />
  </g>
)

function starPath(cx: number, cy: number, outer: number, inner: number) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  })
  return `M${pts.join('L')}Z`
}
const STAR = starPath(16, 16.8, 9.6, 4.1)

const lucide = (Icon: typeof Check, strokeWidth: number, fill = 'none'): ReactNode => (
  <Icon x={5.5} y={5.5} width={21} height={21} color="#fff" strokeWidth={strokeWidth} fill={fill} />
)

const GLYPH: Record<MoveClass, ReactNode> = {
  brilliant: <><Bang x={11.6} s={0.95} /><Bang x={20.4} s={0.95} /></>,
  great: <Bang x={16} />,
  best: <path d={STAR} strokeWidth={1.6} strokeLinejoin="round" />,
  excellent: lucide(ThumbsUp, 2.2, '#fff'),
  good: lucide(Check, 3.4),
  book: lucide(BookOpen, 2.4),
  inaccuracy: <><Ask x={12.3} s={0.8} /><Bang x={21.6} s={0.8} /></>,
  mistake: <Ask x={16} />,
  miss: lucide(X, 3.4),
  blunder: <><Ask x={11.2} s={0.78} /><Ask x={20.8} s={0.78} /></>,
}

export function MoveClassIcon({ cls, size = 20, ring = false }: { cls: MoveClass; size?: number; ring?: boolean }) {
  const id = useId().replace(/:/g, '')
  const color = CLASS_INFO[cls].color
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${ring ? 'rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)]' : ''}`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lighten(color, 0.22)} />
          <stop offset="1" stopColor={color} />
        </linearGradient>
        <filter id={`s${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.9" stdDeviation="0.5" floodColor="#000" floodOpacity="0.25" />
        </filter>
      </defs>
      {ring && <circle cx={16} cy={16} r={16} fill="#fff" />}
      <circle cx={16} cy={16} r={ring ? 14.2 : 16} fill={`url(#g${id})`} />
      <circle cx={16} cy={16} r={ring ? 13.6 : 15.4} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.1} />
      <g fill="#fff" stroke="#fff" filter={`url(#s${id})`} transform={ring ? 'translate(16 16) scale(0.9) translate(-16 -16)' : undefined}>
        {GLYPH[cls]}
      </g>
    </svg>
  )
}
