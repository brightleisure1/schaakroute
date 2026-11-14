import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Chess } from 'chess.js'
import { defaultPieces } from 'react-chessboard'
import { MoveClassIcon } from './MoveClassIcon'
import { CLASS_INFO, type MoveClass } from '../lib/review'
import type { Side } from '../lib/types'

// Deelplaatje van één zet (1200×630, het formaat dat chat-apps en sociale media goed tonen):
// links het bord na de zet met het oordeel op het veld, rechts een kaart met speler, zet en oordeel.
// Alles wordt lokaal op een canvas getekend; er gaat niets naar een server.

const W = 1200
const H = 630
const BOARD = 630

export const SHARE_TITLE: Record<MoveClass, string> = {
  brilliant: 'Briljante zet!!', great: 'Geweldige zet!', best: 'Beste zet', excellent: 'Uitstekende zet', good: 'Goede zet',
  book: 'Theoriezet', inaccuracy: 'Onnauwkeurig', mistake: 'Fout', miss: 'Gemiste kans', blunder: 'Blunder',
}

/** Rendert React-SVG's (stukken, icoontjes) naar losse SVG-teksten die een canvas kan tekenen */
function svgMarkup(items: Record<string, ReactNode>, size: number): Record<string, string> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:200px;height:200px;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(<>{Object.entries(items).map(([k, el]) => <div key={k} data-k={k} style={{ width: size, height: size }}>{el}</div>)}</>))
  const out: Record<string, string> = {}
  for (const k of Object.keys(items)) {
    const svg = host.querySelector(`[data-k="${k}"] > svg`)?.cloneNode(true) as SVGSVGElement | undefined
    if (!svg) continue
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    svg.removeAttribute('class')
    out[k] = svg.outerHTML
  }
  root.unmount()
  host.remove()
  return out
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
const svgImage = (svg: string) => loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Zet de tekst zo groot mogelijk, maar nooit breder dan maxWidth */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px "Inter Variable", Inter, system-ui, sans-serif`
    s -= 2
  } while (ctx.measureText(text).width > maxWidth && s > 12)
}

export interface ShareImageInput {
  fen: string
  orientation: Side
  from: string
  to: string
  cls: MoveClass
  /** Zet zoals in de zettenlijst, bijv. "16. Qb8+" */
  moveText: string
  player: string
  sub: string
}

export async function renderShareImage(o: ShareImageInput): Promise<Blob> {
  await document.fonts?.ready
  const css = getComputedStyle(document.documentElement)
  const light = css.getPropertyValue('--board-light').trim() || '#f1e9d8'
  const dark = css.getPropertyValue('--board-dark').trim() || '#8fae86'
  const color = CLASS_INFO[o.cls].color

  const pieceKeys = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const
  const sq = BOARD / 8
  const svgs = svgMarkup({
    ...Object.fromEntries(pieceKeys.map(k => [k, defaultPieces[k]?.()])),
    icon: <MoveClassIcon cls={o.cls} size={120} ring />,
    big: <MoveClassIcon cls={o.cls} size={120} />,
  }, 120)
  const images = Object.fromEntries(await Promise.all(Object.entries(svgs).map(async ([k, s]) => [k, await svgImage(s)] as const)))
  const logo = await loadImage(import.meta.env.BASE_URL + 'icon.svg').catch(() => null)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // ---- bord ----
  const files = 'abcdefgh'
  const pos = (square: string) => {
    const f = files.indexOf(square[0])
    const r = Number(square[1])
    const col = o.orientation === 'white' ? f : 7 - f
    const row = o.orientation === 'white' ? 8 - r : r - 1
    return { x: col * sq, y: row * sq }
  }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? light : dark
      ctx.fillRect(col * sq, row * sq, sq, sq)
    }
  }
  for (const s of [o.from, o.to]) {
    const p = pos(s)
    ctx.fillStyle = s === o.to ? 'rgba(233, 180, 76, 0.55)' : 'rgba(233, 180, 76, 0.4)'
    ctx.fillRect(p.x, p.y, sq, sq)
  }
  // Coördinaten langs de rand
  ctx.font = '600 15px "Inter Variable", Inter, system-ui, sans-serif'
  for (let i = 0; i < 8; i++) {
    const rank = o.orientation === 'white' ? 8 - i : i + 1
    const file = o.orientation === 'white' ? files[i] : files[7 - i]
    ctx.fillStyle = i % 2 === 0 ? dark : light
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(String(rank), 5, i * sq + 4)
    ctx.fillStyle = (7 + i) % 2 === 0 ? dark : light
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(file, (i + 1) * sq - 5, BOARD - 3)
  }
  const board = new Chess(o.fen).board()
  for (const rank of board) {
    for (const p of rank) {
      if (!p) continue
      const img = images[`${p.color}${p.type.toUpperCase()}`]
      const { x, y } = pos(p.square)
      if (img) ctx.drawImage(img, x + sq * 0.04, y + sq * 0.04, sq * 0.92, sq * 0.92)
    }
  }
  // Oordeel op het doelveld, rechtsboven, binnen het bord gehouden
  const t = pos(o.to)
  const badge = 52
  const bx = Math.min(BOARD - badge - 2, Math.max(2, t.x + sq - badge * 0.7))
  const by = Math.min(BOARD - badge - 2, Math.max(2, t.y - badge * 0.3))
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  if (images.icon) ctx.drawImage(images.icon, bx, by, badge, badge)
  ctx.restore()

  // ---- rechterkant ----
  const px = BOARD
  const pw = W - BOARD
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#2d6b47')
  bg.addColorStop(1, '#0f2117')
  ctx.fillStyle = bg
  ctx.fillRect(px, 0, pw, H)

  const cardX = px + 40
  const cardW = pw - 80
  const cardY = 112
  const cardH = 330
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  roundRect(ctx, cardX, cardY, cardW, cardH, 28)
  ctx.fillStyle = '#121815'
  ctx.fill()
  ctx.restore()
  roundRect(ctx, cardX, cardY, cardW, cardH, 28)
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 2
  ctx.stroke()

  const cx = cardX + cardW / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, o.player, 700, 34, cardW - 60)
  ctx.fillText(o.player, cx, cardY + 70)

  // Icoon + zet op één regel, samen gecentreerd
  const iconSize = 78
  fitFont(ctx, o.moveText, 800, 68, cardW - iconSize - 80)
  const moveW = ctx.measureText(o.moveText).width
  const rowW = iconSize + 18 + moveW
  const rowX = cx - rowW / 2
  const rowY = cardY + 115
  if (images.big) ctx.drawImage(images.big, rowX, rowY, iconSize, iconSize)
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(o.moveText, rowX + iconSize + 18, rowY + iconSize / 2 + 3)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, SHARE_TITLE[o.cls], 800, 46, cardW - 60)
  ctx.fillText(SHARE_TITLE[o.cls], cx, cardY + 262)
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  fitFont(ctx, o.sub, 500, 21, cardW - 60)
  ctx.fillText(o.sub, cx, cardY + 300)

  // Logo en naam onderaan
  const brandY = 540
  ctx.font = '800 34px "Inter Variable", Inter, system-ui, sans-serif'
  const schaakW = ctx.measureText('Schaak').width
  const routeW = ctx.measureText('Route').width
  const logoSize = 46
  const brandW = logoSize + 14 + schaakW + routeW
  const lx = px + pw / 2 - brandW / 2
  if (logo) {
    ctx.save()
    roundRect(ctx, lx, brandY - logoSize / 2, logoSize, logoSize, 11)
    ctx.clip()
    ctx.drawImage(logo, lx, brandY - logoSize / 2, logoSize, logoSize)
    ctx.restore()
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Schaak', lx + logoSize + 14, brandY + 2)
  ctx.fillStyle = '#7fd3a0'
  ctx.fillText('Route', lx + logoSize + 14 + schaakW, brandY + 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '500 18px "Inter Variable", Inter, system-ui, sans-serif'
  ctx.fillText(location.host, px + pw / 2, brandY + 46)

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Plaatje maken lukte niet'))), 'image/png'))
}
