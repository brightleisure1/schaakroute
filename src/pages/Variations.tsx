import { Link, useSearchParams } from 'react-router'
import { useCardMap, useFamily, useManifest, useProgressMap } from '../lib/hooks'
import { VariationBrowser } from '../components/VariationBrowser'
import { ErrorBox, PageHeader, Spinner, useSettings } from '../components/ui'
import type { FamilySummary } from '../lib/types'

export function FamilyPicker({ value, onChange, families, mine }: { value: string; onChange: (id: string) => void; families: FamilySummary[]; mine: string[] }) {
  const sorted = [...families].sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)))
  return (
    <select className="input min-h-11 sm:max-w-sm" value={value} onChange={e => onChange(e.target.value)} aria-label="Kies opening">
      <optgroup label="Wit">{sorted.filter(f => f.side === 'white').map(f => <option key={f.id} value={f.id}>{f.name} ({f.variationCount}){mine.includes(f.id) ? ' · mijn opening' : ''}</option>)}</optgroup>
      <optgroup label="Zwart">{sorted.filter(f => f.side === 'black').map(f => <option key={f.id} value={f.id}>{f.name} ({f.variationCount}){mine.includes(f.id) ? ' · mijn opening' : ''}</option>)}</optgroup>
    </select>
  )
}

export function Variations() {
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const [search, setSearch] = useSearchParams()
  const id = search.get('opening') ?? settings?.openings[0] ?? manifest?.families[0]?.id
  const { data: file } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  if (error) return <ErrorBox error={error} />
  if (!manifest || !settings) return <Spinner />
  // Vanaf een openingspagina ("Alle varianten"): kop met terug naar die opening, zonder openingskeuze
  const fromOpening = !!search.get('opening')
  const fam = manifest.families.find(f => f.id === id)
  return (
    <div>
      {fromOpening ? (
        <header className="mb-5">
          <Link to={`/opening/${id}`} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">← {fam?.name ?? 'Opening'}</Link>
          <h1 className="text-3xl font-extrabold leading-none tracking-tight lg:text-[2.5rem]">Alle varianten</h1>
          <p className="mt-2 text-muted">{fam?.name} · {fam?.variationCount} varianten</p>
        </header>
      ) : (
        <>
          <PageHeader title="Variations" />
          <div className="mb-4"><FamilyPicker value={id ?? ''} onChange={v => setSearch({ opening: v })} families={manifest.families} mine={settings.openings} /></div>
        </>
      )}
      {!file ? <Spinner /> : <VariationBrowser key={file.family.id} file={file} progress={progress} cards={cards} initialFilter="popular" />}
    </div>
  )
}
