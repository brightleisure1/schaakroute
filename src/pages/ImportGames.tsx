import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileUp, User } from 'lucide-react'
import { db, saveSettings, type ImportedGame } from '../lib/db'
import { analyseGames, exitsToCards, fetchChesscomGames, fetchLichessGames, gamesFromPgnFile, saveGames } from '../lib/games'
import { loadAllFamilies, loadNames } from '../lib/data'
import { useAsync } from '../lib/hooks'
import { formatMoves } from '../lib/chess'
import { ChoiceCards, FileField, IconField } from '../components/Choice'
import { ErrorBox, PageHeader, Spinner, pct, sideLabel, useSettings } from '../components/ui'
import { BusyKnight, EmptyKnight } from '../components/PieceMotion'
import { t, tr } from '../lib/i18n'

type Source = 'lichess' | 'chesscom' | 'pgn'
// Een functie (geen vaste waarde), zodat de teksten in de gekozen taal komen
const sources = (): { value: Source; label: string; hint: string }[] => [
  { value: 'lichess', label: 'Lichess', hint: t('laatste 300 partijen') },
  { value: 'chesscom', label: 'Chess.com', hint: t('laatste 3 maanden') },
  { value: 'pgn', label: t('PGN-bestand'), hint: t('vanaf je apparaat') },
]

export function ImportGames() {
  const settings = useSettings()
  const games = useLiveQuery(() => db.games.toArray(), [], [] as ImportedGame[])
  const [source, setSource] = useState<Source | null>(null)
  const [lichess, setLichess] = useState<string | null>(null)
  const [chesscom, setChesscom] = useState<string | null>(null)
  const [pgnUser, setPgnUser] = useState('')
  const [pgnFile, setPgnFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Zonder eigen keuze: de bron waarvan we al een gebruikersnaam kennen
  const chosen: Source = source ?? (!settings?.lichessUser && settings?.chesscomUser ? 'chesscom' : 'lichess')
  const lichessName = (lichess ?? settings?.lichessUser ?? '').trim()
  const chesscomName = (chesscom ?? settings?.chesscomUser ?? '').trim()
  const ready = chosen === 'lichess' ? !!lichessName : chosen === 'chesscom' ? !!chesscomName : !!pgnFile

  async function run(label: string, fn: () => Promise<ImportedGame[]>) {
    setBusy(label); setErr(null); setMsg(null)
    try {
      const g = await fn()
      await saveGames(g)
      setMsg(t('{n} partijen geïmporteerd.', { n: g.length }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !ready) return
    if (chosen === 'lichess') {
      saveSettings({ lichessUser: lichessName })
      run('lichess', () => fetchLichessGames(lichessName, 300, n => setBusy(t('Lichess: {n} partijen…', { n }))))
    } else if (chosen === 'chesscom') {
      saveSettings({ chesscomUser: chesscomName })
      run('chesscom', () => fetchChesscomGames(chesscomName, 3, n => setBusy(t('Chess.com: {n} partijen…', { n }))))
    } else if (pgnFile) {
      const file = pgnFile
      run('pgn', async () => gamesFromPgnFile(await file.text(), pgnUser))
    }
  }

  const userIcon = <User size={18} strokeWidth={2.25} />
  return (
    <div className="space-y-6">
      <PageHeader title={t('Mijn partijen')} subtitle={t('Met je eigen partijen krijg je persoonlijke aanbevelingen.')} />
      <form className="space-y-4 lg:max-w-3xl" onSubmit={submit}>
        <ChoiceCards name="games-source" label={t('Waar staan je partijen?')} value={chosen} onChange={s => { setSource(s); setErr(null); setMsg(null) }} options={sources()} className="sm:grid-cols-3" />
        <div className="space-y-3 sm:max-w-md">
          {chosen === 'lichess' && (
            <IconField key="lichess" icon={userIcon} label={t('Gebruikersnaam op {source}', { source: 'Lichess' })} placeholder={t('Gebruikersnaam op {source}', { source: 'Lichess' })} autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={lichess ?? settings?.lichessUser ?? ''} onChange={e => setLichess(e.target.value)} />
          )}
          {chosen === 'chesscom' && (
            <IconField key="chesscom" icon={userIcon} label={t('Gebruikersnaam op {source}', { source: 'Chess.com' })} placeholder={t('Gebruikersnaam op {source}', { source: 'Chess.com' })} autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={chesscom ?? settings?.chesscomUser ?? ''} onChange={e => setChesscom(e.target.value)} />
          )}
          {chosen === 'pgn' && (
            <>
              <FileField icon={<FileUp size={18} strokeWidth={2.25} />} label={t('PGN-bestand kiezen')} placeholder={t('Kies een PGN-bestand…')} accept=".pgn,text/plain" fileName={pgnFile?.name} onFile={f => setPgnFile(f ?? null)} disabled={!!busy} />
              <IconField key="pgn" icon={userIcon} label={t('Jouw naam in de PGN (White/Black)')} placeholder={t('Jouw naam in de PGN (White/Black)')} autoCapitalize="none" spellCheck={false}
                value={pgnUser} onChange={e => setPgnUser(e.target.value)} />
              <p className="text-xs text-muted">{t('Zonder naam worden alle partijen als wit geteld.')}</p>
            </>
          )}
          <div>
            <button className={`btn btn-primary w-full ${busy ? 'btn-busy' : ''}`} disabled={!!busy || !ready} aria-busy={!!busy} aria-describedby={!ready ? 'import-reason' : undefined}>{busy ? <BusyKnight /> : <Download size={20} strokeWidth={2.25} aria-hidden />}{busy ? t('Partijen ophalen…') : t('Partijen ophalen')}</button>
            {!ready && <p id="import-reason" className="btn-reason">{chosen === 'pgn' ? t('Kies eerst een PGN-bestand.') : t('Vul eerst je gebruikersnaam in.')}</p>}
          </div>
        </div>
      </form>
      {busy && <Spinner label={busy.includes('…') ? busy : t('Bezig met importeren…')} />}
      {err && <ErrorBox error={err} />}
      {msg && <div className="card bg-brand-soft p-3 text-sm text-brand-strong" role="status">{msg}</div>}
      {games.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[18px] border-2 border-line bg-surface p-4 lg:max-w-3xl">
          <EmptyKnight size={44} className="bg-surface-2" />
          <p className="text-sm leading-snug text-muted">{t('Nog geen partijen opgehaald. Daarna zie je hier je werkpunten per opening.')}</p>
        </div>
      ) : <AnalysisView games={games} />}
    </div>
  )
}

function AnalysisView({ games }: { games: ImportedGame[] }) {
  const settings = useSettings()
  const families = useAsync(() => loadAllFamilies(), [])
  const names = useAsync(() => loadNames(), [])
  const reps = useLiveQuery(async () => {
    const rs = await db.repertoires.toArray()
    return Promise.all(rs.map(async r => ({ id: r.id!, name: r.name, side: r.side, moves: await db.repMoves.where('repertoireId').equals(r.id!).toArray() })))
  }, [], [])
  const progress = useLiveQuery(() => db.progress.toArray(), [], [])
  const [done, setDone] = useState<string | null>(null)
  const analysis = useMemo(() => {
    if (!families.data || !names.data || !settings) return null
    const learned = new Set(progress.filter(p => p.completions > 0).map(p => p.id))
    return analyseGames(games, families.data, names.data, settings.openings, reps, learned)
  }, [games, families.data, names.data, settings, reps, progress])

  if (!analysis) return <Spinner label={t('Partijen analyseren…')} />
  const famSide = new Map((families.data ?? []).map(f => [f.family.id, f.family.side]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('Analyse van {n} partijen', { n: analysis.games })}</h2>
        <button className="btn btn-quiet text-sm" onClick={async () => { if (confirm(t('Alle geïmporteerde partijen verwijderen?'))) await db.games.clear() }}>{t('Partijen wissen')}</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">{t('Welke openingen speel je?')}</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="text-left">{t('Opening')}</th><th>{t('Kleur')}</th><th className="text-right">{t('Partijen')}</th><th className="text-right">{t('Score')}</th></tr></thead>
            <tbody>{analysis.byFamily.slice(0, 12).map(f => (
              <tr key={f.familyId + f.color} className="border-t border-line">
                <td className="py-1.5 pr-2"><span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><Link to={`/opening/${f.familyId}`} className="hover:underline">{f.name}</Link>{f.inMyOpenings && <span className="chip chip-sm chip-on">{t('mijn opening')}</span>}</span></td>
                <td className="text-center text-xs">{sideLabel(f.color)}</td>
                <td className="text-right tabular-nums">{f.games}</td>
                <td className="text-right tabular-nums">{pct(f.score)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">{t('Welke varianten ken je het slechtst?')}</h3>
          <ul className="space-y-1 text-sm">
            {analysis.byName.filter(n => n.games >= 3).sort((a, b) => a.score - b.score).slice(0, 8).map(n => (
              <li key={n.name + n.color} className="flex justify-between gap-2 border-t border-line pt-1"><span className="truncate">{n.name} <span className="text-xs text-muted">({sideLabel(n.color).toLowerCase()})</span></span><span className="shrink-0 tabular-nums text-muted">{n.games} · {pct(n.score)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('Openingszetten die je vaak anders speelt dan de theorie')}</h3>
          {analysis.userBookExits.length > 0 && <button className="btn btn-primary" onClick={async () => { const n = await exitsToCards(analysis.userBookExits.slice(0, 30), e => famSide.get(e.familyId) ?? 'white'); setDone(t('{n} nieuwe posities toegevoegd aan je herhalingen (Herhalen en dagtraining).', { n })) }}>{t('Train mijn fouten')}</button>}
        </div>
        {done && <div className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong">{done}</div>}
        {analysis.userBookExits.length === 0 ? <p className="mt-2 text-sm text-muted">{t('Geen afwijkingen gevonden in de openingen.')}</p> : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {analysis.userBookExits.slice(0, 12).map(e => (
              <li key={e.key} className="py-2">
                <div className="font-mono text-xs text-muted">{formatMoves(e.lineSan)}</div>
                <div>{tr(<>Jij speelde <b className="font-mono">{e.played}</b> ({e.count}×); theorie: <b className="font-mono">{e.bookMoves.map(b => b.san).join(', ')}</b></>, <>You played <b className="font-mono">{e.played}</b> ({e.count}×); theory: <b className="font-mono">{e.bookMoves.map(b => b.san).join(', ')}</b></>)} <span className="text-xs text-muted">· {e.familyName}</span></div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">{t('Afwijkingen van je repertoire')}</h3>
          {reps.length === 0 ? <p className="text-sm text-muted">{tr(<><Link to="/repertoire" className="underline">Maak een repertoire</Link> om dit te zien.</>, <><Link to="/repertoire" className="underline">Create a repertoire</Link> to see this.</>)}</p> : analysis.repertoireDeviations.length === 0 && analysis.repertoireGaps.length === 0 ? <p className="text-sm text-muted">{t('Geen afwijkingen gevonden.')}</p> : (
            <ul className="space-y-2 text-sm">
              {analysis.repertoireDeviations.slice(0, 6).map(d => <li key={d.repertoire + d.epd + d.played}><span className="font-mono text-xs text-muted">{formatMoves(d.lineSan)}</span><br />{tr(<>Jij: <b>{d.played}</b>, repertoire: <b>{d.expected}</b></>, <>You: <b>{d.played}</b>, repertoire: <b>{d.expected}</b></>)} ({d.count}×) · {d.repertoire}</li>)}
              {analysis.repertoireGaps.slice(0, 6).map(d => <li key={'g' + d.repertoire + d.epd + d.opponentMove}><span className="font-mono text-xs text-muted">{formatMoves(d.lineSan)}</span><br />{tr(<>Tegenstander speelde <b>{d.opponentMove}</b> ({d.count}×), niet in je repertoire</>, <>Opponent played <b>{d.opponentMove}</b> ({d.count}×), not in your repertoire</>)} · {d.repertoire}</li>)}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">{t('Nuttig om te leren')}</h3>
          {analysis.recommendations.length === 0 ? <p className="text-sm text-muted">{t('Geen aanbevelingen: de varianten die je tegenkomt heb je al geleerd.')}</p> : (
            <ul className="space-y-1 text-sm">
              {analysis.recommendations.map(r => (
                <li key={r.variationId}><Link to={`/train/${r.familyId}/${r.variationId}?mode=learn`} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2"><span className="truncate">{r.name} <span className="text-xs text-muted">· {r.familyName}</span></span><span className="shrink-0 text-xs text-muted">{t('{n}× in je partijen', { n: r.games })}</span></Link></li>
              ))}
            </ul>
          )}
          {analysis.byFamily.some(f => !f.inMyOpenings && f.games >= 5) && (
            <p className="mt-3 text-xs text-muted">{tr(<>Je speelt ook vaak: {analysis.byFamily.filter(f => !f.inMyOpenings && f.games >= 5).slice(0, 4).map(f => f.name).join(', ')}. Voeg ze toe via <Link to="/welkom" className="underline">je openingen</Link>.</>, <>You also often play: {analysis.byFamily.filter(f => !f.inMyOpenings && f.games >= 5).slice(0, 4).map(f => f.name).join(', ')}. Add them via <Link to="/welkom" className="underline">your openings</Link>.</>)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
