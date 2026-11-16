import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chess } from 'chess.js'
import { ChessKing, ChessKnight, ChessPawn, ChevronRight, Dumbbell, Plus } from 'lucide-react'
import { db, type RepertoireMove } from '../lib/db'
import { addLine, deleteMove, repertoireLines, setMain, updateComment } from '../lib/repertoire'
import { loadFamily, loadNames, loadStats } from '../lib/data'
import { START_FEN, epdOf, parseUci, uciOf } from '../lib/chess'
import { isUserPly } from '../lib/trainer'
import { parsePgn, splitGames, treeToPgn } from '../lib/pgn'
import { useAsync, useManifest } from '../lib/hooks'
import { endSession, startSession } from '../lib/progress'
import { Board } from '../components/Board'
import { MoveList, Trainer } from '../components/Trainer'
import { Empty, ErrorBox, PageHeader, ProgressBar, Spinner, pct, sideLabel } from '../components/ui'
import { Segmented } from '../components/Choice'
import { STARTERS, createStarterRepertoire } from '../components/repertoireStarter'
import type { Side, StatsFile } from '../lib/types'
import { locale, t, tr } from '../lib/i18n'

const PANEL = 'rounded-[18px] border-2 border-line bg-surface'

/** Engels aantal met enkelvoud of meervoud (het Nederlands gebruikt hier altijd het meervoud) */
const en = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function RepertoireList() {
  const reps = useLiveQuery(() => db.repertoires.toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.repMoves.toArray()
    const m = new Map<number, number>()
    for (const x of all) m.set(x.repertoireId, (m.get(x.repertoireId) ?? 0) + 1)
    return m
  }, [], new Map<number, number>())
  const { data: manifest } = useManifest()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function start(familyId: string) {
    setStarting(familyId); setErr(null)
    try {
      nav(`/repertoire/${await createStarterRepertoire(familyId)}`)
    } catch (e) {
      setErr(e instanceof TypeError ? t('Kon de openingsdata niet laden. Controleer je internetverbinding.') : (e as Error).message)
      setStarting(null)
    }
  }

  if (!reps) return <Spinner />
  const empty = reps.length === 0
  const starters = STARTERS.filter(s => !manifest || manifest.families.some(f => f.id === s.familyId))
  const form = <NewRepertoire onCancel={() => setCreating(false)} />

  return (
    <div>
      <PageHeader title={t('Mijn repertoire')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          {empty ? (creating ? form : (
            <section className={`${PANEL} flex flex-col items-center gap-1.5 px-5 py-7 text-center`}>
              <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-[19px] bg-brand-soft text-brand-strong"><ChessKnight size={34} strokeWidth={1.75} /></span>
              <h2 className="mt-2 text-lg font-extrabold tracking-tight">{t('Nog geen repertoire')}</h2>
              <p className="max-w-[280px] text-sm leading-snug text-muted">{t('Bundel de varianten die jij echt speelt en train alleen die.')}</p>
              <button className="btn btn-primary mt-3 w-full" onClick={() => setCreating(true)}><Plus size={20} strokeWidth={2.5} aria-hidden />{t('Nieuw repertoire')}</button>
            </section>
          )) : (
            <ul className="space-y-3">
              {reps.map(r => (
                <li key={r.id} className="tap flex items-center gap-2 p-2 pl-2.5">
                  <Link to={`/repertoire/${r.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                      <ChessKing size={24} strokeWidth={1.75} aria-label={sideLabel(r.side)} className={r.side === 'black' ? 'fill-current' : ''} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{r.name}</span>
                      <span className="block text-[13px] text-muted">{sideLabel(r.side)} · {tr(`${counts.get(r.id!) ?? 0} zetten`, en(counts.get(r.id!) ?? 0, 'move', 'moves'))} · {t('bijgewerkt {date}', { date: new Date(r.updatedAt).toLocaleDateString(locale()) })}</span>
                    </span>
                  </Link>
                  <Link to={`/repertoire/${r.id}/train`} className="btn btn-ghost shrink-0" aria-label={t('{name} trainen', { name: r.name })}><Dumbbell size={16} aria-hidden />{t('Trainen')}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          {empty ? starters.length > 0 && (
            <section className={`${PANEL} space-y-3 p-4`}>
              <h2 className="text-[15px] font-bold">{t('Of begin met een voorstel')}</h2>
              {starters.map(s => (
                <button key={s.familyId} className="tap flex min-h-11 w-full items-center gap-3 p-2.5 text-left disabled:opacity-60" disabled={!!starting} onClick={() => start(s.familyId)}>
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    <ChessPawn size={22} strokeWidth={1.75} className={s.side === 'black' ? 'fill-current' : ''} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{t(s.title)}</span>
                    <span className="block text-[13px] text-muted">{starting === s.familyId ? t('Repertoire maken…') : t(s.hint)}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
                </button>
              ))}
              {err && <ErrorBox error={err} />}
            </section>
          ) : creating ? form : (
            <button className="tap flex min-h-14 w-full items-center justify-center gap-2 px-4 font-bold text-brand-strong!" onClick={() => setCreating(true)}><Plus size={20} strokeWidth={2.5} aria-hidden />{t('Nieuw repertoire')}</button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Nieuw repertoire: kies een kleur en eventueel een opening als begin; een naam is optioneel */
function NewRepertoire({ onCancel }: { onCancel: () => void }) {
  const { data: manifest } = useManifest()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [side, setSide] = useState<Side>('white')
  const [familyId, setFamilyId] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const fam = manifest?.families.find(f => f.id === familyId && f.side === side)
    const id = (await db.repertoires.add({ name: name.trim() || placeholder, side, familyId: fam?.id, createdAt: Date.now(), updatedAt: Date.now() })) as number
    if (fam) await addLine(id, fam.side, fam.rootUci)
    nav(`/repertoire/${id}`)
  }

  const chosenName = manifest?.families.find(f => f.id === familyId)?.name
  const placeholder = familyId ? t('Mijn {name}', { name: chosenName ?? '' }) : side === 'white' ? t('Repertoire wit') : t('Repertoire zwart')

  return (
    <form className={`${PANEL} space-y-3 p-4`} onSubmit={create}>
      <h2 className="text-lg font-extrabold tracking-tight">{t('Nieuw repertoire')}</h2>
      <Segmented name="new-rep-side" label={t('Kleur')} value={side} onChange={s => { setSide(s); setFamilyId('') }}
        options={[{ value: 'white', label: t('Ik speel wit') }, { value: 'black', label: t('Ik speel zwart') }]} />
      <div>
        <label htmlFor="new-rep-family" className="mb-1 block text-sm font-semibold">{t('Begin met')}</label>
        <select id="new-rep-family" className="input min-h-11" value={familyId} onChange={e => setFamilyId(e.target.value)}>
          <option value="">{t('Een leeg bord')}</option>
          {manifest?.families.filter(f => f.side === side).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="new-rep-name" className="mb-1 block text-sm font-semibold">{t('Naam')} <span className="font-normal text-muted">{t('(mag leeg)')}</span></label>
        <input id="new-rep-name" className="input min-h-11" placeholder={placeholder} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <button className="btn btn-primary w-full" disabled={busy}>{t('Aanmaken')}</button>
      <button type="button" className="btn btn-quiet min-h-11 w-full" onClick={onCancel}>{t('Annuleren')}</button>
    </form>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function RepertoireEditor() {
  const { id } = useParams()
  const repId = Number(id)
  const nav = useNavigate()
  const rep = useLiveQuery(() => db.repertoires.get(repId), [repId])
  const moves = useLiveQuery(() => db.repMoves.where('repertoireId').equals(repId).toArray(), [repId], [] as RepertoireMove[])
  const names = useAsync(() => loadNames(), [])
  const stats = useAsync<StatsFile | null>(() => (rep?.familyId ? loadStats(rep.familyId) : Promise.resolve(null)), [rep?.familyId])
  const { data: manifest } = useManifest()
  const [path, setPath] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [pgnText, setPgnText] = useState('')
  const [showTree, setShowTree] = useState(false)
  const [importFam, setImportFam] = useState('')
  const [importFilter, setImportFilter] = useState<'main' | 'all'>('main')

  const byEpd = useMemo(() => {
    const m = new Map<string, RepertoireMove[]>()
    for (const x of moves) m.set(x.epd, [...(m.get(x.epd) ?? []), x])
    return m
  }, [moves])
  const { fen, san, last } = useMemo(() => {
    const c = new Chess(START_FEN)
    const san: string[] = []
    let last: [string, string] | null = null
    for (const u of path) { const m = c.move(parseUci(u)); san.push(m.san); last = [m.from, m.to] }
    return { fen: c.fen(), san, last }
  }, [path])
  useEffect(() => { setMsg(null) }, [path])

  if (!rep) return <Spinner />
  const epd = epdOf(fen)
  const here = (byEpd.get(epd) ?? []).sort((a, b) => Number(b.main) - Number(a.main))
  const myTurn = isUserPly(path.length, rep.side)
  const pos = stats.data?.positions[epd]

  async function play(from: string, to: string, promotion?: string) {
    const c = new Chess(fen)
    let m
    try { m = c.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const u = uciOf(m)
    const exists = here.some(x => x.uci === u)
    if (!exists) {
      const r = await addLine(repId, rep!.side, [...path, u])
      setMsg(r.conflicts.length ? t('{san} opgeslagen als alternatief (je hoofdzet hier is {main}).', { san: m.san, main: r.conflicts[0].existing }) : t('{san} toegevoegd.', { san: m.san }))
    }
    setPath(p => [...p, u])
    return true
  }

  async function importPgn(text: string) {
    let lines = 0
    let errors: string[] = []
    for (const g of splitGames(text)) {
      const parsed = parsePgn(g)
      errors = errors.concat(parsed.errors)
      for (const l of parsed.lines) { await addLine(repId, rep!.side, l); lines++ }
    }
    setMsg(`${tr(`${lines} lijnen geïmporteerd`, en(lines, 'line imported', 'lines imported'))}${errors.length ? `; ${tr(`${errors.length} ongeldige zetten overgeslagen`, en(errors.length, 'invalid move skipped', 'invalid moves skipped'))} (${errors.slice(0, 2).join('; ')})` : ''}.`)
  }

  async function importFamily() {
    if (!importFam) return
    const f = await loadFamily(importFam)
    if (f.family.side !== rep!.side) { setMsg(f.family.side === 'white' ? t('{name} is een opening voor wit; dit repertoire is voor zwart.', { name: f.family.name }) : t('{name} is een opening voor zwart; dit repertoire is voor wit.', { name: f.family.name })); return }
    const vs = f.variations.filter(v => importFilter === 'all' || v.tags.includes('main') || v.tags.includes('base'))
    let conflicts = 0
    for (const v of vs) conflicts += (await addLine(repId, rep!.side, v.uci)).conflicts.length
    setMsg(`${t('{n} varianten uit {name} toegevoegd', { n: vs.length, name: f.family.name })}${conflicts ? `; ${tr(`${conflicts} afwijkende zetten van jouw kant bewaard als alternatief`, en(conflicts, 'different move of yours kept as an alternative', 'different moves of yours kept as alternatives'))}` : ''}.`)
  }

  const pgn = () => treeToPgn(e => (byEpd.get(e) ?? []).map(x => ({ uci: x.uci, san: x.san, main: x.main, comment: x.comment })), { Event: rep.name, White: rep.side === 'white' ? t('Ik') : '?', Black: rep.side === 'black' ? t('Ik') : '?' })

  return (
    <div>
      <PageHeader back="/repertoire" title={rep.name} subtitle={`${sideLabel(rep.side)} · ${tr(`${moves.length} zetten`, en(moves.length, 'move', 'moves'))}`} actions={<>
        <Link to={`/repertoire/${repId}/train`} className="btn btn-primary">{t('Trainen')}</Link>
        <button className="btn btn-ghost" onClick={() => download(`${rep.name}.pgn`, pgn())}>{t('PGN exporteren')}</button>
        <button className="btn btn-ghost" onClick={async () => { if (confirm(t('Repertoire "{name}" verwijderen? Je trainingsvoortgang per stelling blijft bewaard.', { name: rep.name }))) { await db.repMoves.where('repertoireId').equals(repId).delete(); await db.repertoires.delete(repId); nav('/repertoire') } }}>{t('Verwijderen')}</button>
      </>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="mx-auto w-full max-w-[min(92vw,600px)]">
          <Board id="rep-editor" fen={fen} orientation={rep.side} movable={fen.split(' ')[1] === 'w' ? 'white' : 'black'} onMove={(from, to, p) => { play(from, to, p); return true }} lastMove={last} />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={() => setPath(p => p.slice(0, -1))} disabled={!path.length}>{t('Terug')}</button>
            <button className="btn btn-ghost flex-1" onClick={() => setPath([])}>⟲ {t('Begin')}</button>
          </div>
        </div>
        <aside className="space-y-3">
          <div className="card p-4">
            <div className="text-sm text-muted">{names.data?.[epd]?.[1] ?? t('Speel zetten op het bord om ze toe te voegen.')}</div>
            <MoveList sans={san} current={san.length} onSelect={p => setPath(x => x.slice(0, p))} />
            {msg && <div className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong">{msg}</div>}
          </div>
          <div className="card p-4">
            <div className="mb-2 font-semibold">{myTurn ? t('Jouw zet in deze stelling') : t('Reacties van de tegenstander')}</div>
            {here.length === 0 ? <p className="text-sm text-muted">{t('Nog niets opgeslagen. Speel een zet op het bord.')}</p> : (
              <ul className="space-y-1.5">
                {here.map(m => (
                  <li key={m.id} className="rounded-lg border border-line p-2">
                    <div className="flex items-center gap-2">
                      <button className="font-mono font-semibold hover:underline" onClick={() => setPath(p => [...p, m.uci])}>{m.san}</button>
                      {myTurn && (m.main ? <span className="chip chip-on !text-xs">{t('hoofdzet')}</span> : <button className="chip !text-xs" onClick={() => setMain(m.id!)}>{t('maak hoofdzet')}</button>)}
                      <button className="ml-auto text-xs text-muted hover:text-danger-ink" onClick={() => { if (confirm(t('{san} en alles erna verwijderen?', { san: m.san }))) deleteMove(m.id!) }}>{t('verwijderen')}</button>
                    </div>
                    <input className="mt-1 w-full bg-transparent text-xs text-muted outline-none" placeholder={t('notitie…')} defaultValue={m.comment ?? ''} onBlur={e => updateComment(m.id!, e.target.value)} />
                  </li>
                ))}
              </ul>
            )}
            {pos && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-xs font-semibold text-muted">{t('Vaak gespeeld hier')}</div>
                <div className="flex flex-wrap gap-1">
                  {pos.m.slice(0, 8).map(m => <button key={m[0]} className="chip" onClick={() => play(m[0].slice(0, 2), m[0].slice(2, 4), m[0][4])}>{m[1]} <span className="font-normal">{pct(m[2] / pos.n)}</span></button>)}
                </div>
              </div>
            )}
          </div>
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">{t('Varianten importeren')}</summary>
            <div className="mt-3 space-y-2">
              <select className="input" value={importFam} onChange={e => setImportFam(e.target.value)}>
                <option value="">{t('Kies een opening…')}</option>
                {manifest?.families.filter(f => f.side === rep.side).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button aria-pressed={importFilter === 'main'} className={`chip min-h-11 px-3 ${importFilter === 'main' ? 'chip-on' : ''}`} onClick={() => setImportFilter('main')}>{t('Alleen hoofdvarianten')}</button>
                <button aria-pressed={importFilter === 'all'} className={`chip min-h-11 px-3 ${importFilter === 'all' ? 'chip-on' : ''}`} onClick={() => setImportFilter('all')}>{t('Alle varianten')}</button>
              </div>
              <button className="btn btn-ghost w-full" onClick={importFamily} disabled={!importFam}>{t('Toevoegen')}</button>
              <hr className="border-line" />
              <textarea className="input h-28 font-mono text-xs" placeholder={t('Plak PGN (varianten tussen haakjes worden meegenomen)…')} value={pgnText} onChange={e => setPgnText(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn btn-ghost flex-1" onClick={() => importPgn(pgnText)} disabled={!pgnText.trim()}>{t('PGN importeren')}</button>
                <label className="btn btn-ghost flex-1 cursor-pointer">{t('Bestand…')}<input type="file" accept=".pgn,text/plain" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) importPgn(await f.text()) }} /></label>
              </div>
            </div>
          </details>
          <div className="card p-4">
            <button className="flex min-h-11 items-center gap-1 font-semibold" onClick={() => setShowTree(s => !s)} aria-expanded={showTree}><ChevronRight size={18} aria-hidden className={`transition ${showTree ? 'rotate-90' : ''}`} />{t('Complete variantenboom')}</button>
            {showTree && <RepTree byEpd={byEpd} onGo={setPath} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

function RepTree({ byEpd, onGo }: { byEpd: Map<string, RepertoireMove[]>; onGo: (p: string[]) => void }) {
  const render = (fen: string, path: string[], depth: number, seen: Set<string>): React.ReactNode => {
    const epd = epdOf(fen)
    const kids = (byEpd.get(epd) ?? []).sort((a, b) => Number(b.main) - Number(a.main))
    if (!kids.length || seen.has(epd) || depth > 40) return null
    const next = new Set(seen).add(epd)
    return (
      <ul className={depth ? 'ml-3 border-l border-line pl-2' : ''}>
        {kids.map(k => {
          const c = new Chess(fen)
          c.move(parseUci(k.uci))
          const p = [...path, k.uci]
          return (
            <li key={k.id}>
              <button className="font-mono text-sm hover:underline" onClick={() => onGo(p)}>
                {path.length % 2 === 0 ? `${path.length / 2 + 1}.` : `${Math.floor(path.length / 2) + 1}…`} {k.san}{k.main ? '' : ` ${t('(alt.)')}`}
              </button>
              {kids.length === 1 ? render(c.fen(), p, depth, next) : render(c.fen(), p, depth + 1, next)}
            </li>
          )
        })}
      </ul>
    )
  }
  return <div className="mt-2 max-h-96 overflow-auto scrollbar-thin">{render(START_FEN, [], 0, new Set()) ?? <p className="text-sm text-muted">{t('Leeg.')}</p>}</div>
}

export function RepertoireTrain() {
  const { id } = useParams()
  const repId = Number(id)
  const rep = useLiveQuery(() => db.repertoires.get(repId), [repId])
  const lines = useAsync(() => repertoireLines(repId), [repId])
  const [index, setIndex] = useState(0)
  const [sessionId, setSessionId] = useState<number>()
  const family = useAsync(() => (rep?.familyId ? loadFamily(rep.familyId) : Promise.resolve(undefined)), [rep?.familyId])
  useEffect(() => {
    let sid: number | undefined
    startSession('repertoire').then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [])
  if (lines.error) return <ErrorBox error={lines.error} />
  if (!rep || lines.loading) return <Spinner />
  const list = lines.data ?? []
  if (!list.length) return <Empty title={t('Dit repertoire heeft nog geen trainbare lijnen')} action={<Link className="btn btn-primary" to={`/repertoire/${repId}`}>{t('Zetten toevoegen')}</Link>}>{t('Voeg minstens één zet van jouw kant toe.')}</Empty>
  const line = list[index % list.length]
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link to={`/repertoire/${repId}`} className="text-sm text-muted hover:text-ink">← {rep.name}</Link>
        <div className="w-48"><ProgressBar value={(index % list.length) / list.length} /><div className="mt-1 text-right text-xs text-muted">{t('lijn {n} van {total}', { n: (index % list.length) + 1, total: list.length })}</div></div>
      </div>
      <Trainer
        key={line.key + index}
        line={{ ...line, familyId: rep.familyId, title: rep.name, subtitle: line.san.join(' ') }}
        mode="practice"
        family={family.data}
        sessionId={sessionId}
        autoIntro={false}
        renderEnd={(_r, restart) => (
          <>
            <button className="btn btn-primary min-h-12" autoFocus onClick={() => setIndex(i => i + 1)}>{t('Volgende lijn')}</button>
            <button className="btn btn-ghost min-h-11" onClick={restart}>{t('Opnieuw')}</button>
          </>
        )}
      />
    </div>
  )
}
