import { useAsync, useManifest } from '../lib/hooks'
import { ErrorBox, PageHeader, Spinner, nf, pct } from '../components/ui'
import type { RankingEntry } from '../lib/types'
import { t, tr } from '../lib/i18n'

// Teksten uit de dataset (methode, uitsluitingsredenen) zijn Nederlands; t() vertaalt ze als ze in het woordenboek staan.

export function Sources() {
  const { data: m, error } = useManifest()
  const ranking = useAsync(() => fetch(import.meta.env.BASE_URL + 'data/ranking.json').then(r => r.json() as Promise<{ white: RankingEntry[]; black: RankingEntry[] }>), [])
  if (error) return <ErrorBox error={error} />
  if (!m) return <Spinner />
  const g = m.source.games
  const totalVariations = m.families.reduce((a, f) => a + f.variationCount, 0)
  return (
    <div className="space-y-6">
      <PageHeader title={t('Bronnen & methode')} subtitle={t('Hoe de openingen zijn gekozen, waar de data vandaan komt en welke licenties gelden.')} />
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-base font-semibold">Dataset {m.datasetVersion}</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>{t('Openingen:')} <a className="underline" href={m.source.openings.repo} target="_blank" rel="noreferrer">lichess-org/chess-openings</a> @ <span className="font-mono">{m.source.openings.ref.slice(0, 10)}</span> ({m.source.openings.license}), {t('{n} regels uit a.tsv–e.tsv, {m} illegale lijnen.', { n: nf(m.source.openings.rows), m: m.source.openings.illegal })}</li>
          <li>{t('Populariteit en praktijkstatistieken:')} <a className="underline" href="https://database.lichess.org" target="_blank" rel="noreferrer">{t('Lichess-partijendatabase')}</a> ({g.license}), {t('maand {month}.', { month: g.month })} {t(g.method)}. {t('{n} partijen verzameld, waarvan {m} rated blitz/rapid/classical gebruikt.', { n: nf(g.sampledGames), m: nf(g.usedGames) })}</li>
          <li>{t('Ratingverdeling in de steekproef (gemiddelde van beide spelers):')} {Object.entries(g.ratingBands).map(([k, v]) => `${k}: ${pct(v / g.usedGames)}`).join(' · ')}.</li>
          <li>{t('Snelheden:')} {Object.entries(g.speeds).map(([k, v]) => `${k} ${nf(v)}`).join(' · ')}.</li>
          {m.source.puzzles && <li>{t('Puzzels bij Afstraffen:')} <a className="underline" href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">{t('Lichess-puzzeldatabase')}</a> ({m.source.puzzles.license}), {t('{n} puzzels gescand; alleen thema “opening” en waarin jouw kant een fout afstraft.', { n: nf(m.source.puzzles.scanned) })}</li>}
          <li>{t('In totaal {n} varianten in de {m} openingen, zonder limiet per opening.', { n: nf(totalVariations), m: m.families.length })}</li>
        </ul>
      </section>
      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-base font-semibold">{t('Methode van de ranglijst')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">{m.method.map(x => <li key={x}>{t(x)}</li>)}</ol>
        <p className="text-muted">{tr(
          <><b>Beperkingen:</b> de cijfers komen uit één maand Lichess-partijen, waar snelle partijen en lagere ratings sterk vertegenwoordigd zijn. Daardoor staan bijvoorbeeld de Englund- en Scandinavische opening hoog. Het opnieuw draaien van het importscript met een andere maand kan de onderste plaatsen veranderen. De Lichess Opening Explorer (die een token vereist) is niet gebruikt voor de ranglijst, zodat de selectie zonder account reproduceerbaar is.</>,
          <><b>Limitations:</b> the numbers come from one month of Lichess games, where fast games and lower ratings are strongly represented. That is why, for example, the Englund Gambit and the Scandinavian Defense rank high. Re-running the import script with a different month can change the lower places. The Lichess Opening Explorer (which requires a token) was not used for the ranking, so the selection can be reproduced without an account.</>,
        )}</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {(['white', 'black'] as const).map(side => (
          <div key={side} className="card p-4">
            <h2 className="mb-2 font-semibold">{side === 'white' ? t('Ranglijst wit (top 25)') : t('Ranglijst zwart (top 25)')}</h2>
            {!ranking.data ? <Spinner /> : (
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-muted"><tr><th className="text-left">#</th><th className="text-left">{t('Familie')}</th><th className="text-right">{t('Partijen')}</th><th className="text-right">{t('Aandeel')}</th><th className="text-right">{t('Lijnen')}</th></tr></thead>
                <tbody>{ranking.data[side].slice(0, 25).map(e => (
                  <tr key={e.family} className={`border-t border-line ${e.rank && e.rank <= 10 ? 'font-medium' : 'text-muted'}`}>
                    <td>{e.rank ?? '–'}</td>
                    <td>{e.family}{e.excluded && <div className="text-xs text-muted">{t('niet geselecteerd: {reason}', { reason: t(e.excluded) })}</div>}</td>
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
        <h2 className="mb-2 font-semibold">{t('Importcontrole per opening')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted"><tr><th className="text-left">{t('Opening')}</th><th className="text-right">{t('Bronregels')}</th><th className="text-right">{t('Varianten')}</th><th className="text-right">{t('Unieke namen')}</th><th className="text-right">{t('Met transpositie')}</th><th className="text-right">{t('Statistiek-stellingen')}</th><th className="text-right">{t('Puzzels')}</th></tr></thead>
            <tbody>{m.validation.report.map(r => (
              <tr key={r.family} className="border-t border-line">
                <td>{r.family}</td><td className="text-right">{r.sourceRows}</td><td className="text-right">{r.variations}</td><td className="text-right">{r.distinctNames}</td><td className="text-right">{r.linesWithTransposition}</td><td className="text-right">{nf(r.statPositions)}</td>
                <td className="text-right">{m.validation.puzzles?.find(p => p.family === r.family)?.selected ?? '–'}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <section className="card space-y-2 p-5 text-sm text-muted">
        <h2 className="text-base font-semibold text-ink">{t('Licenties')}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>SchaakRoute: GPL-3.0-or-later {t('(vanwege de meegeleverde Stockfish).')}</li>
          <li>Stockfish 19 {t('(via stockfish.js van Nathan Rugg):')} GPLv3, <a className="underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">{t('broncode-verwijzing')}</a>, <a className="underline" href="./engine/COPYING.txt" target="_blank" rel="noreferrer">{t('licentietekst')}</a>.</li>
          <li>chess.js (BSD-2-Clause), react-chessboard (MIT), React (MIT), Dexie (Apache-2.0), Tailwind CSS (MIT), Vite (MIT), vite-plugin-pwa (MIT).</li>
          <li>{t('Lichess-data (openingen, partijen, puzzels): CC0 1.0, publiek domein.')}</li>
          <li>{t('Lotus Chess diende als inspiratie voor de leerervaring; er is geen tekst, afbeelding of vormgeving van overgenomen.')}</li>
        </ul>
      </section>
    </div>
  )
}
