import { Link, useParams } from 'react-router'
import { familyProgress, useCardMap, useFamily, useProgressMap } from '../lib/hooks'
import { fenFromEpd, formatMoves } from '../lib/chess'
import { MiniBoard } from '../components/Board'
import { VariationBrowser } from '../components/VariationBrowser'
import { ErrorBox, PageHeader, ProgressBar, Spinner, StatTile, pct, nf, sideLabel } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'

export function OpeningDetail() {
  const { id } = useParams()
  const { data: file, error, loading } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  if (error) return <ErrorBox error={error} />
  if (loading || !file) return <Spinner />
  const f = file.family
  const info = OPENING_INFO[f.id]
  const p = familyProgress(file, progress, cards)
  const counts = {
    main: file.variations.filter(v => v.tags.includes('main') || v.tags.includes('base')).length,
    side: file.variations.filter(v => v.tags.includes('side')).length,
    gambit: file.variations.filter(v => v.tags.includes('gambit')).length,
    tactical: file.variations.filter(v => v.tags.includes('tactical')).length,
    rare: file.variations.filter(v => v.tags.includes('rare')).length,
    sub: file.variations.filter(v => v.tags.includes('sub')).length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back="/openingen"
        title={f.name}
        subtitle={<>{info?.nameNl} · {sideLabel(f.side)} · ECO {f.ecoRange} · #{f.rank} populairst voor {f.side === 'white' ? 'wit' : 'zwart'}</>}
        actions={<>
          <Link to={`/cursus/${f.id}`} className="btn btn-primary">Course starten</Link>
          <Link to={`/crushing/${f.id}`} className="btn btn-ghost">⚔ Crushing</Link>
          <Link to={`/advantage/${f.id}`} className="btn btn-ghost">📈 Advantage</Link>
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[300px] space-y-3 lg:max-w-none">
          <MiniBoard id={`detail-${f.id}`} fen={fenFromEpd(f.rootEpd)} orientation={f.side} />
          <div className="card p-3 text-sm">
            <div className="text-muted">Belangrijkste beginzetten</div>
            <div className="font-mono font-semibold">{info?.keyMoves ?? formatMoves(f.rootSan)}</div>
          </div>
        </div>
        <div className="space-y-4">
          {info && (
            <div className="card p-5">
              <p>{info.summary}</p>
              <p className="mt-2 text-muted">{info.idea}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <InfoList title="Typische plannen" items={info.plans} />
                <InfoList title="Sterke punten" items={info.strengths} tone="text-brand-strong" />
                <InfoList title="Zwakke punten" items={info.weaknesses} tone="text-danger" />
              </div>
              <div className="mt-4 rounded-xl bg-accent-soft p-3 text-sm"><b>Tip:</b> {info.tip}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Benoemde varianten" value={f.variationCount} hint={`${f.namedCount} unieke namen`} />
            <StatTile label="Subvarianten" value={f.subvariationCount} />
            <StatTile label="Partijen (steekproef)" value={nf(f.games)} hint={`${pct(f.share, 1)} van alle partijen`} />
            <StatTile label="Mijn voortgang" value={`${p.learned}/${p.total}`} hint={<ProgressBar value={p.pct} className="mt-1" />} />
          </div>
          <div className="card grid grid-cols-3 gap-2 p-3 text-center text-xs sm:grid-cols-6">
            {[['Hoofd', counts.main], ['Zij', counts.side], ['Gambieten', counts.gambit], ['Tactisch', counts.tactical], ['Zeldzaam', counts.rare], ['Sub', counts.sub]].map(([l, n]) => (
              <div key={l as string}><div className="text-base font-bold">{n}</div><div className="text-muted">{l}</div></div>
            ))}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-1 text-lg font-bold">Alle {f.variationCount} varianten</h2>
        <p className="mb-3 text-sm text-muted">Rechtstreeks geïmporteerd uit de Lichess-openingsdatabase, zonder limiet. Klik op een variant om hem te leren of te oefenen. Frequentie = aandeel van de partijen in deze opening dat de stelling bereikte.</p>
        <VariationBrowser file={file} progress={progress} cards={cards} />
      </section>
    </div>
  )
}

function InfoList({ title, items, tone = '' }: { title: string; items: string[]; tone?: string }) {
  return (
    <div>
      <div className={`mb-1 text-sm font-semibold ${tone}`}>{title}</div>
      <ul className="list-disc space-y-1 pl-4 text-sm text-muted">{items.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  )
}
