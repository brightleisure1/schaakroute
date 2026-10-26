import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronDown, Swords, TrendingUp } from 'lucide-react'
import { familyProgress, useCardMap, useFamily, useProgressMap } from '../lib/hooks'
import { fenFromEpd, formatMoves } from '../lib/chess'
import { MiniBoard } from '../components/Board'
import { VariationBrowser } from '../components/VariationBrowser'
import { ErrorBox, PageHeader, ProgressBar, Spinner, pct, nf, sideLabel } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'
import type { Variation } from '../lib/types'

export function OpeningDetail() {
  const { id } = useParams()
  const { data: file, error, loading } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  const [preview, setPreview] = useState<Variation | null>(null)
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

  const shown = preview ?? null
  return (
    <div className="space-y-5">
      <PageHeader
        back="/openingen"
        title={f.name}
        subtitle={<>{info?.nameNl} · {sideLabel(f.side)} · ECO {f.ecoRange} · #{f.rank} populairst voor {f.side === 'white' ? 'wit' : 'zwart'}</>}
        actions={<>
          <Link to={`/cursus/${f.id}`} className="btn btn-primary min-h-11">Course starten</Link>
          <Link to={`/crushing/${f.id}`} className="btn btn-ghost min-h-11"><Swords size={16} aria-hidden />Crushing</Link>
          <Link to={`/advantage/${f.id}`} className="btn btn-ghost min-h-11"><TrendingUp size={16} aria-hidden />Advantage</Link>
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <div className="w-full space-y-3 lg:sticky lg:top-6">
          {/* Het voorbeeldbord volgt de muisaanwijzer; op touchscreens zou het de lijst alleen onder de vouw duwen */}
          <div className="hidden lg:block"><MiniBoard id={`detail-${f.id}`} fen={fenFromEpd(shown?.epd ?? f.rootEpd)} orientation={f.side} /></div>
          <div className="card p-3 text-sm" aria-live="polite">
            <div className="text-muted">{shown ? 'Eindstelling van' : 'Belangrijkste beginzetten'}</div>
            <div className="font-semibold">{shown ? (shown.path.join(', ') || f.name) : null}</div>
            <div className="font-mono text-xs">{shown ? formatMoves(shown.san) : info?.keyMoves ?? formatMoves(f.rootSan)}</div>
          </div>
          <dl className="card grid grid-cols-2 gap-x-3 sm:grid-cols-4 lg:grid-cols-2 gap-y-2 p-3 text-sm">
            <div><dt className="text-muted">Varianten</dt><dd className="font-bold tabular-nums">{f.variationCount}</dd></div>
            <div><dt className="text-muted">Subvarianten</dt><dd className="font-bold tabular-nums">{f.subvariationCount}</dd></div>
            <div><dt className="text-muted">Gambieten</dt><dd className="font-bold tabular-nums">{counts.gambit}</dd></div>
            <div><dt className="text-muted">Partijen</dt><dd className="font-bold tabular-nums" title={`${pct(f.share, 1)} van alle partijen in de steekproef`}>{nf(f.games)}</dd></div>
            <div className="col-span-2 sm:col-span-4 lg:col-span-2"><dt className="text-muted">Mijn voortgang</dt><dd><span className="font-bold tabular-nums">{p.learned}/{p.total}</span> varianten · {p.mastered} beheerst<ProgressBar value={p.pct} className="mt-1.5" label="Varianten geleerd" /></dd></div>
          </dl>
        </div>

        <div className="min-w-0 space-y-4">
          {info && (
            <details className="card group p-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <span className="max-w-prose">
                  <span className="block font-semibold">Over deze opening</span>
                  <span className="block text-sm text-muted">{info.idea}</span>
                </span>
                <ChevronDown size={20} aria-hidden className="mt-0.5 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-3 max-w-prose space-y-3">
                <p>{info.summary}</p>
                <InfoList title="Typische plannen" items={info.plans} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoList title="Sterke punten" items={info.strengths} tone="text-brand-strong" />
                  <InfoList title="Zwakke punten" items={info.weaknesses} tone="text-danger-ink" />
                </div>
                <p className="rounded-xl bg-accent-soft p-3 text-sm"><b>Tip:</b> {info.tip}</p>
              </div>
            </details>
          )}

          <section aria-labelledby="var-title">
            <h2 id="var-title" className="text-lg font-bold">Alle {f.variationCount} varianten</h2>
            <p className="mb-3 text-sm text-muted">Uit de Lichess-database. Kies een variant om hem te leren.</p>
            <VariationBrowser file={file} progress={progress} cards={cards} onPreview={setPreview} />
          </section>
        </div>
      </div>
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
