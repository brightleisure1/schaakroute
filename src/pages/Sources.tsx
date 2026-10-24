import { useAsync, useManifest } from '../lib/hooks'
import { ErrorBox, PageHeader, Spinner, nf, pct } from '../components/ui'
import type { RankingEntry } from '../lib/types'

export function Sources() {
  const { data: m, error } = useManifest()
  const ranking = useAsync(() => fetch(import.meta.env.BASE_URL + 'data/ranking.json').then(r => r.json() as Promise<{ white: RankingEntry[]; black: RankingEntry[] }>), [])
  if (error) return <ErrorBox error={error} />
  if (!m) return <Spinner />
  const g = m.source.games
  const totalVariations = m.families.reduce((a, f) => a + f.variationCount, 0)
  return (
    <div className="space-y-6">
      <PageHeader title="Bronnen & methode" subtitle="Hoe de 20 openingen zijn gekozen, waar de data vandaan komt en welke licenties gelden." />
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-base font-semibold">Dataset {m.datasetVersion}</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Openingen: <a className="underline" href={m.source.openings.repo} target="_blank" rel="noreferrer">lichess-org/chess-openings</a> @ <span className="font-mono">{m.source.openings.ref.slice(0, 10)}</span> ({m.source.openings.license}) — {nf(m.source.openings.rows)} regels uit a.tsv–e.tsv, {m.source.openings.illegal} illegale lijnen.</li>
          <li>Populariteit en praktijkstatistieken: <a className="underline" href="https://database.lichess.org" target="_blank" rel="noreferrer">Lichess-partijendatabase</a> ({g.license}), maand {g.month}. {g.method}. {nf(g.sampledGames)} partijen verzameld, waarvan {nf(g.usedGames)} rated blitz/rapid/classical gebruikt.</li>
          <li>Ratingverdeling in de steekproef (gemiddelde van beide spelers): {Object.entries(g.ratingBands).map(([k, v]) => `${k}: ${pct(v / g.usedGames)}`).join(' · ')}.</li>
          <li>Snelheden: {Object.entries(g.speeds).map(([k, v]) => `${k} ${nf(v)}`).join(' · ')}.</li>
          {m.source.puzzles && <li>Crushing-puzzels: <a className="underline" href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">Lichess-puzzeldatabase</a> ({m.source.puzzles.license}), {nf(m.source.puzzles.scanned)} puzzels gescand; alleen thema “opening” en waarin jouw kant een fout afstraft.</li>}
          <li>In totaal {nf(totalVariations)} benoemde varianten in de 20 openingen — zonder limiet per opening.</li>
        </ul>
      </section>
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-base font-semibold">Methode van de ranglijst</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">{m.method.map(x => <li key={x}>{x}</li>)}</ol>
        <p className="text-muted"><b>Beperkingen:</b> de cijfers komen uit één maand Lichess-partijen, waar snelle partijen en lagere ratings sterk vertegenwoordigd zijn — daardoor staan bijvoorbeeld de Englund- en Scandinavische opening hoog. Het opnieuw draaien van het importscript met een andere maand kan de onderste plaatsen veranderen. De Lichess Opening Explorer (die een token vereist) is niet gebruikt voor de ranglijst, zodat de selectie zonder account reproduceerbaar is.</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {(['white', 'black'] as const).map(side => (
          <div key={side} className="card p-4">
            <h2 className="mb-2 font-semibold">Ranglijst {side === 'white' ? 'wit' : 'zwart'} (top 25)</h2>
            {!ranking.data ? <Spinner /> : (
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-muted"><tr><th className="text-left">#</th><th className="text-left">Familie</th><th className="text-right">Partijen</th><th className="text-right">Aandeel</th><th className="text-right">Lijnen</th></tr></thead>
                <tbody>{ranking.data[side].slice(0, 25).map(e => (
                  <tr key={e.family} className={`border-t border-line ${e.rank && e.rank <= 10 ? 'font-medium' : 'text-muted'}`}>
                    <td>{e.rank ?? '–'}</td>
                    <td>{e.family}{e.excluded && <div className="text-xs text-muted">niet geselecteerd: {e.excluded}</div>}</td>
                    <td className="text-right">{nf(e.games)}</td>
                    <td className="text-right">{pct(e.share, 2)}</td>
                    <td className="text-right">{e.lines}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
        ))}
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Importcontrole per opening</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted"><tr><th className="text-left">Opening</th><th className="text-right">Bronregels</th><th className="text-right">Varianten</th><th className="text-right">Unieke namen</th><th className="text-right">Met transpositie</th><th className="text-right">Statistiek-stellingen</th><th className="text-right">Puzzels</th></tr></thead>
            <tbody>{m.validation.report.map(r => (
              <tr key={r.family} className="border-t border-line">
                <td>{r.family}</td><td className="text-right">{r.sourceRows}</td><td className="text-right">{r.variations}</td><td className="text-right">{r.distinctNames}</td><td className="text-right">{r.linesWithTransposition}</td><td className="text-right">{nf(r.statPositions)}</td>
                <td className="text-right">{m.validation.puzzles?.find(p => p.family === r.family)?.selected ?? '–'}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <section className="card space-y-2 p-5 text-sm text-muted">
        <h2 className="text-base font-semibold text-ink">Licenties</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>SchaakRoute: GPL-3.0-or-later (vanwege de meegeleverde Stockfish).</li>
          <li>Stockfish 19 (via stockfish.js van Nathan Rugg): GPLv3 — <a className="underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">broncode-verwijzing</a>, <a className="underline" href="./engine/COPYING.txt" target="_blank" rel="noreferrer">licentietekst</a>.</li>
          <li>chess.js (BSD-2-Clause), react-chessboard (MIT), React (MIT), Dexie (Apache-2.0), Tailwind CSS (MIT), Vite (MIT), vite-plugin-pwa (MIT).</li>
          <li>Lichess-data (openingen, partijen, puzzels): CC0 1.0 — publiek domein.</li>
          <li>Lotus Chess diende als inspiratie voor de leerervaring; er is geen tekst, afbeelding of vormgeving van overgenomen.</li>
        </ul>
      </section>
    </div>
  )
}
