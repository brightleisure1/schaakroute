import { useState } from 'react'
import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { familyProgress, useCardMap, useFamilies, useManifest, useProgressMap } from '../lib/hooks'
import { formatMoves } from '../lib/chess'
import { CropBoard } from '../components/CropBoard'
import { ErrorBox, PageHeader, ProgressBar, Spinner, Tabs, pct, nf, useSettings } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'
import type { Side } from '../lib/types'

export function Openings() {
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const [side, setSide] = useState<Side>(settings?.sides === 'black' ? 'black' : 'white')
  const families = useFamilies(manifest?.families.map(f => f.id) ?? [])
  const progress = useProgressMap()
  const cards = useCardMap()
  if (error) return <ErrorBox error={error} />
  if (!manifest) return <Spinner />
  const list = manifest.families.filter(f => f.side === side)
  const files = new Map((families.data ?? []).map(f => [f.family.id, f]))

  return (
    <div>
      <PageHeader
        title="Openingen"
        subtitle={<>De 10 populairste openingsfamilies per kleur, op basis van {nf(manifest.source.games.usedGames)} rated Lichess-partijen ({manifest.source.games.month}). <Link to="/bronnen" className="underline">Methode</Link></>}
      />
      <Tabs value={side} onChange={setSide} options={[{ value: 'white', label: 'Wit — 10 openingen' }, { value: 'black', label: 'Zwart — 10 openingen' }]} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map(f => {
          const file = files.get(f.id)
          const p = file ? familyProgress(file, progress, cards) : null
          const mine = settings?.openings.includes(f.id)
          return (
            <article key={f.id} className="card relative flex flex-col p-4">
              {/* Label als sticker op de rand, in de hoek rechtsboven */}
              {mine && <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-brand py-1 pl-2 pr-2.5 text-xs font-semibold text-on-brand shadow-[0_2px_8px_rgb(31_42_36/0.18)] ring-2 ring-bg"><Check size={13} strokeWidth={3} aria-hidden />Mijn opening</span>}
              <div className="flex gap-3">
                <div className="w-28 shrink-0 self-start"><CropBoard epd={f.rootEpd} uci={f.rootUci} orientation={f.side} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-muted">#{f.rank} · {f.ecoRange}</div>
                  <h2 className="text-lg font-bold leading-tight">{f.name}</h2>
                  <div className="text-sm text-muted">{OPENING_INFO[f.id]?.nameNl}</div>
                  <div className="mt-1 font-mono text-xs text-muted">{formatMoves(f.rootSan)}</div>
                </div>
              </div>
              {/* Telefoon: één regel in plaats van drie tegels, zodat de lijst korter wordt */}
              <p className="mt-2 text-xs text-muted sm:hidden">{f.variationCount} varianten · {pct(f.share, 1)} van de partijen</p>
              <dl className="mt-3 hidden grid-cols-3 gap-2 text-center text-xs sm:grid">
                <div className="rounded-lg bg-surface-2 p-2"><dt className="text-muted">Varianten</dt><dd className="text-base font-bold">{f.variationCount}</dd></div>
                <div className="rounded-lg bg-surface-2 p-2"><dt className="text-muted">Subvarianten</dt><dd className="text-base font-bold">{f.subvariationCount}</dd></div>
                <div className="rounded-lg bg-surface-2 p-2" title={`${nf(f.games)} partijen in de steekproef`}><dt className="text-muted">Populariteit</dt><dd className="text-base font-bold">{pct(f.share, 1)}</dd></div>
              </dl>
              <div className="mt-3">
                <ProgressBar value={p?.pct ?? 0} />
                <div className="mt-1 text-xs text-muted">{p ? `${p.learned} van ${p.total} varianten geleerd · ${p.mastered} beheerst` : '…'}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link to={`/cursus/${f.id}`} className="btn btn-primary flex-1">Begin met leren</Link>
                <Link to={`/opening/${f.id}`} className="btn btn-ghost">Details</Link>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
