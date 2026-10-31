import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveSettings, type ImportedGame } from '../lib/db'
import { analyseGames, exitsToCards, fetchChesscomGames, fetchLichessGames, gamesFromPgnFile, saveGames } from '../lib/games'
import { loadAllFamilies, loadNames } from '../lib/data'
import { useAsync } from '../lib/hooks'
import { formatMoves } from '../lib/chess'
import { Empty, ErrorBox, PageHeader, Spinner, pct, sideLabel, useSettings } from '../components/ui'

export function ImportGames() {
  const settings = useSettings()
  const games = useLiveQuery(() => db.games.toArray(), [], [] as ImportedGame[])
  const [lichess, setLichess] = useState('')
  const [chesscom, setChesscom] = useState('')
  const [pgnUser, setPgnUser] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function run(label: string, fn: () => Promise<ImportedGame[]>) {
    setBusy(label); setErr(null); setMsg(null)
    try {
      const g = await fn()
      await saveGames(g)
      setMsg(`${g.length} partijen geïmporteerd.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mijn partijen" subtitle="Haal je partijen op van Lichess of Chess.com." />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-2 p-4">
          <h2 className="font-semibold">Lichess</h2>
          <input className="input" placeholder="Gebruikersnaam" defaultValue={settings?.lichessUser} onChange={e => setLichess(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={!!busy || !(lichess || settings?.lichessUser)} onClick={() => { const u = lichess || settings!.lichessUser!; saveSettings({ lichessUser: u }); run('lichess', () => fetchLichessGames(u, 300, n => setBusy(`Lichess: ${n} partijen…`))) }}>Laatste 300 partijen ophalen</button>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="font-semibold">Chess.com</h2>
          <input className="input" placeholder="Gebruikersnaam" defaultValue={settings?.chesscomUser} onChange={e => setChesscom(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={!!busy || !(chesscom || settings?.chesscomUser)} onClick={() => { const u = chesscom || settings!.chesscomUser!; saveSettings({ chesscomUser: u }); run('chesscom', () => fetchChesscomGames(u, 3, n => setBusy(`Chess.com: ${n} partijen…`))) }}>Laatste 3 maanden ophalen</button>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="font-semibold">PGN-bestand</h2>
          <input className="input" placeholder="Jouw naam in de PGN (White/Black)" value={pgnUser} onChange={e => setPgnUser(e.target.value)} />
          <label className={`btn btn-ghost w-full cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>Bestand kiezen…<input type="file" accept=".pgn,text/plain" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { const text = await f.text(); run('pgn', async () => gamesFromPgnFile(text, pgnUser)) } }} /></label>
          <p className="text-xs text-muted">Zonder naam worden alle partijen als wit geteld.</p>
        </div>
      </div>
      {busy && <Spinner label={busy.includes('…') ? busy : 'Bezig met importeren…'} />}
      {err && <ErrorBox error={err} />}
      {msg && <div className="card bg-brand-soft p-3 text-sm text-brand-strong">{msg}</div>}
      {games.length === 0 ? (
        <Empty title="Nog geen partijen geïmporteerd">De app werkt ook prima zonder. Met je eigen partijen krijg je persoonlijke aanbevelingen en trainingen.</Empty>
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

  if (!analysis) return <Spinner label="Partijen analyseren…" />
  const famSide = new Map((families.data ?? []).map(f => [f.family.id, f.family.side]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Analyse van {analysis.games} partijen</h2>
        <button className="btn btn-quiet text-sm" onClick={async () => { if (confirm('Alle geïmporteerde partijen verwijderen?')) await db.games.clear() }}>Partijen wissen</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Welke openingen speel je?</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="text-left">Opening</th><th>Kleur</th><th className="text-right">Partijen</th><th className="text-right">Score</th></tr></thead>
            <tbody>{analysis.byFamily.slice(0, 12).map(f => (
              <tr key={f.familyId + f.color} className="border-t border-line">
                <td className="py-1.5"><Link to={`/opening/${f.familyId}`} className="hover:underline">{f.name}</Link>{f.inMyOpenings && <span className="chip chip-sm chip-on ml-1.5">mijn opening</span>}</td>
                <td className="text-center text-xs">{sideLabel(f.color)}</td>
                <td className="text-right tabular-nums">{f.games}</td>
                <td className="text-right tabular-nums">{pct(f.score)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Welke varianten ken je het slechtst?</h3>
          <ul className="space-y-1 text-sm">
            {analysis.byName.filter(n => n.games >= 3).sort((a, b) => a.score - b.score).slice(0, 8).map(n => (
              <li key={n.name + n.color} className="flex justify-between gap-2 border-t border-line pt-1"><span className="truncate">{n.name} <span className="text-xs text-muted">({sideLabel(n.color).toLowerCase()})</span></span><span className="shrink-0 tabular-nums text-muted">{n.games} · {pct(n.score)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Openingszetten die je vaak anders speelt dan de theorie</h3>
          {analysis.userBookExits.length > 0 && <button className="btn btn-primary" onClick={async () => { const n = await exitsToCards(analysis.userBookExits.slice(0, 30), e => famSide.get(e.familyId) ?? 'white'); setDone(`${n} nieuwe posities toegevoegd aan je herhalingen (Herhalen en dagtraining).`) }}>Train mijn fouten</button>}
        </div>
        {done && <div className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong">{done}</div>}
        {analysis.userBookExits.length === 0 ? <p className="mt-2 text-sm text-muted">Geen afwijkingen gevonden in de openingen.</p> : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {analysis.userBookExits.slice(0, 12).map(e => (
              <li key={e.key} className="py-2">
                <div className="font-mono text-xs text-muted">{formatMoves(e.lineSan)}</div>
                <div>Jij speelde <b className="font-mono">{e.played}</b> ({e.count}×); theorie: <b className="font-mono">{e.bookMoves.map(b => b.san).join(', ')}</b> <span className="text-xs text-muted">· {e.familyName}</span></div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Afwijkingen van je repertoire</h3>
          {reps.length === 0 ? <p className="text-sm text-muted"><Link to="/repertoire" className="underline">Maak een repertoire</Link> om dit te zien.</p> : analysis.repertoireDeviations.length === 0 && analysis.repertoireGaps.length === 0 ? <p className="text-sm text-muted">Geen afwijkingen gevonden.</p> : (
            <ul className="space-y-2 text-sm">
              {analysis.repertoireDeviations.slice(0, 6).map(d => <li key={d.repertoire + d.epd + d.played}><span className="font-mono text-xs text-muted">{formatMoves(d.lineSan)}</span><br />Jij: <b>{d.played}</b>, repertoire: <b>{d.expected}</b> ({d.count}×) · {d.repertoire}</li>)}
              {analysis.repertoireGaps.slice(0, 6).map(d => <li key={'g' + d.repertoire + d.epd + d.opponentMove}><span className="font-mono text-xs text-muted">{formatMoves(d.lineSan)}</span><br />Tegenstander speelde <b>{d.opponentMove}</b> ({d.count}×), niet in je repertoire · {d.repertoire}</li>)}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Nuttig om te leren</h3>
          {analysis.recommendations.length === 0 ? <p className="text-sm text-muted">Geen aanbevelingen: de varianten die je tegenkomt heb je al geleerd.</p> : (
            <ul className="space-y-1 text-sm">
              {analysis.recommendations.map(r => (
                <li key={r.variationId}><Link to={`/train/${r.familyId}/${r.variationId}?mode=learn`} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2"><span className="truncate">{r.name} <span className="text-xs text-muted">· {r.familyName}</span></span><span className="shrink-0 text-xs text-muted">{r.games}× in je partijen</span></Link></li>
              ))}
            </ul>
          )}
          {analysis.byFamily.some(f => !f.inMyOpenings && f.games >= 5) && (
            <p className="mt-3 text-xs text-muted">Je speelt ook vaak: {analysis.byFamily.filter(f => !f.inMyOpenings && f.games >= 5).slice(0, 4).map(f => f.name).join(', ')}. Voeg ze toe via <Link to="/welkom" className="underline">je openingen</Link>.</p>
          )}
        </div>
      </div>
    </div>
  )
}
