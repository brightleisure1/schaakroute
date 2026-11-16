import type { CSSProperties, ReactNode } from 'react'
import { defaultPieces } from 'react-chessboard'
import { Check } from 'lucide-react'

// Ontwerp ronde 13: kleine animaties met schaakstukken voor wachten en voor iets dat gelukt is.
// De beweging zit in index.css (klassen pm-*); met 'Beweging verminderen' staat alles stil.
// Dezelfde stukken als op het bord (react-chessboard). Alles is decoratief: de tekst ernaast zegt wat er gebeurt.

type Vars = CSSProperties & Record<`--${string}`, string | number>

function Piece({ piece, className = '', style }: { piece: string; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={`block ${className}`} style={style}>
      {defaultPieces[piece]?.({ svgStyle: { width: '100%', height: '100%', display: 'block' } })}
    </span>
  )
}

/** Velden van een klein bordje; `dark(i)` zegt welke velden donker zijn */
function Squares({ cols, count, dark, className = '', delay }: { cols: number; count: number; dark: (i: number) => boolean; className?: string; delay?: (i: number) => number }) {
  return (
    <div className="pm-squares" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={className} style={{ background: dark(i) ? 'var(--board-dark)' : 'var(--board-light)', ...(delay ? { '--d': `${delay(i)}s` } as Vars : null) }} />
      ))}
    </div>
  )
}

const checker = (cols: number) => (i: number) => (Math.floor(i / cols) + (i % cols)) % 2 === 1

// ---------------- 13a App laden ----------------

const KNIGHT_LANDINGS = [[1, 1], [3, 0], [2, 2], [0, 3]] // kolom, rij: elk een paardensprong verder

/** Het paard springt een rondje over een 4×4-bordje; elk landingsveld licht even goud op. Voor het openen van de app. */
export function AppLoading({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${fullscreen ? 'min-h-dvh px-4' : 'min-h-[50vh] py-10 pm-bl'}`} role="status">
      <div className="pm-board" style={{ '--sq': '44px', width: 176 } as Vars}>
        <Squares cols={4} count={16} dark={checker(4)} />
        {KNIGHT_LANDINGS.map(([c, r], i) => (
          <span key={i} className="pm-kn-hl" style={{ left: `calc(var(--sq) * ${c})`, top: `calc(var(--sq) * ${r})`, animationDelay: `${0.7 + i * 0.8}s` }} />
        ))}
        <div className="pm-kn">
          <span className="pm-kn-shadow" />
          <div className="pm-kn-hop"><Piece piece="bN" className="h-[44px] w-[44px]" /></div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-lg font-extrabold tracking-[-0.02em]">Schaak<span className="text-brand-strong">Route</span></div>
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          Je route wordt klaargezet
          <span aria-hidden className="inline-flex gap-[3px]">
            {[0, 0.2, 0.4].map(d => <span key={d} className="pm-dot" style={{ animationDelay: `${d}s` }} />)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------- 13b Analyse bezig ----------------

/** Rij van 8 velden: de pion loopt mee met de echte voortgang (0–1); bij 1 promoveert hij tot dame. */
export function AnalysisPawn({ value, label }: { value: number; label: string }) {
  const p = Math.max(0, Math.min(1, value))
  const done = p >= 1
  return (
    <div className="pm-row mx-auto" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <Squares cols={8} count={8} dark={i => i % 2 === 1} />
      <span className="pm-row-fill" style={{ width: `${12.5 + p * 87.5}%` }} />
      {done && <span className="pm-row-ring" />}
      <div className="pm-row-pawn" style={{ left: `${p * 87.5}%`, opacity: done ? 0 : 1 }}>
        <div className="pm-row-step"><Piece piece="bP" className="h-full w-full" /></div>
      </div>
      {done && <Piece piece="bQ" className="pm-row-queen" />}
    </div>
  )
}

// ---------------- 13c Kort wachten ----------------

/** Drie pionnen die na elkaar opwippen */
export function HoppingPawns({ size = 46 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-flex items-end" style={{ gap: Math.round(size * 0.13), height: Math.round(size * 1.3) }}>
      {['bP', 'wP', 'bP'].map((pc, i) => <span key={i} className="pm-hop"><Piece piece={pc} className={pc[0] === 'b' ? 'pm-lift' : ''} style={{ width: size, height: size }} /></span>)}
    </span>
  )
}

/** Klein, in een regel tekst: pionnetjes + "Laden…" */
export function InlineWait({ label = 'Laden…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-muted ${className}`} role="status">
      <span className="-mt-1.5"><HoppingPawns size={16} /></span>{label}
    </div>
  )
}

// ---------------- 13d Bord laden ----------------

const DROPS: { piece: string; c: number; r: number }[] = [
  { piece: 'bN', c: 0, r: 0 }, { piece: 'bP', c: 2, r: 1 }, { piece: 'wP', c: 2, r: 2 }, { piece: 'wN', c: 3, r: 3 },
]

/** Bordje dat zich opbouwt: velden in een golf, daarna vallen de stukken op hun plek. Speelt één keer. */
export function BoardLoading({ label = 'Bord laden…' }: { label?: string }) {
  return (
    <div className="pm-bl flex justify-center py-10" role="status">
      <span className="sr-only">{label}</span>
      <div className="relative w-48 overflow-hidden rounded-xl" aria-hidden>
        <Squares cols={4} count={16} dark={checker(4)} className="pm-bl-sq" delay={i => (Math.floor(i / 4) + (i % 4)) * 0.045} />
        {DROPS.map((d, i) => (
          <div key={i} className="pm-bl-pc" style={{ left: `${d.c * 25}%`, top: `${d.r * 25}%`, '--d': `${0.25 + i * 0.06}s` } as Vars}>
            <Piece piece={d.piece} className="h-full w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------- 13e Knop bezig ----------------

/**
 * Wiegend paard in plaats van het icoon in een knop. Neemt precies `size` px in (zoals het icoon dat het vervangt),
 * zodat de knop niet verspringt. Zet `btn-busy` op de knop voor de lichtstreep.
 */
export function BusyKnight({ size = 20, piece = 'wN' }: { size?: number; piece?: string }) {
  const big = Math.round(size * 1.25) // het stuk heeft wat lucht in zijn vakje; zo oogt het even groot als het icoon
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="pm-rock absolute" style={{ left: (size - big) / 2, top: (size - big) / 2, width: big, height: big }}>
        <Piece piece={piece} className="h-full w-full" />
      </span>
    </span>
  )
}

// ---------------- 13f Gelukt: rokade ----------------

const SPARKS: [number, string][] = [[-70, 'var(--accent)'], [-25, 'var(--brand)'], [20, 'var(--accent)'], [65, 'var(--brand)'], [-110, 'var(--brand)'], [110, 'var(--accent)']]

/** Koning en toren rokeren (e1–h1 wordt g1/f1), daarna een vinkje met vonken. Speelt één keer; geef een nieuwe key om te herhalen. */
export function CastleSuccess({ sq = 56 }: { sq?: number }) {
  return (
    <div aria-hidden className="shrink-0" style={{ paddingTop: Math.round(sq * 0.82) }}>
      <div className="pm-board" style={{ '--sq': `${sq}px`, width: sq * 4, height: sq, borderRadius: Math.max(6, sq * 0.21) } as Vars}>
        <Squares cols={4} count={4} dark={i => i % 2 === 0} />
        <div className="pm-ck-king"><Piece piece="wK" className="h-full w-full" /></div>
        <div className="pm-ck-rook"><Piece piece="wR" className="h-full w-full" /></div>
        <div className="pm-ck-burst">
          {SPARKS.map(([deg, color]) => (
            <div key={deg} className="pm-ck-ray" style={{ transform: `rotate(${deg}deg)` }}>
              <span className="pm-ck-spark" style={{ background: color, width: Math.max(4, sq / 7), height: Math.max(4, sq / 7) }} />
            </div>
          ))}
          <span className="pm-ck-badge"><Check size={Math.round(sq * 0.43)} strokeWidth={3} /></span>
        </div>
      </div>
    </div>
  )
}

/** Melding dat iets bewaard is, met de rokade ervoor */
export function SuccessNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <CastleSuccess sq={24} />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

// ---------------- 13g Lege staat ----------------

/** Paard in een groen tegeltje dat af en toe om zich heen kijkt, met een vraagteken. `size` = het tegeltje in px. */
export function EmptyKnight({ size = 64, className = 'bg-brand-soft' }: { size?: number; className?: string }) {
  return (
    <span aria-hidden className={`relative flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.29) }}>
      <span className="pm-nod"><Piece piece="bN" className="pm-lift" style={{ width: Math.round(size * 0.69), height: Math.round(size * 0.69) }} /></span>
      <span className="pm-qm" style={{ fontSize: Math.max(11, Math.round(size * 0.18)) }}>?</span>
    </span>
  )
}
