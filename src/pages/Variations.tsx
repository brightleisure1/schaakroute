import { useSearchParams } from 'react-router'
import { useCardMap, useFamily, useManifest, useProgressMap } from '../lib/hooks'
import { VariationBrowser } from '../components/VariationBrowser'
import { ErrorBox, PageHeader, Spinner, useSettings } from '../components/ui'
import type { FamilySummary } from '../lib/types'

export function FamilyPicker({ value, onChange, families, mine }: { value: string; onChange: (id: string) => void; families: FamilySummary[]; mine: string[] }) {
  const sorted = [...families].sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)))
  return (
    <select className="input sm:max-w-sm" value={value} onChange={e => onChange(e.target.value)} aria-label="Kies opening">
      <optgroup label="Wit">{sorted.filter(f => f.side === 'white').map(f => <option key={f.id} value={f.id}>{mine.includes(f.id) ? '★ ' : ''}{f.name} ({f.variationCount})</option>)}</optgroup>
      <optgroup label="Zwart">{sorted.filter(f => f.side === 'black').map(f => <option key={f.id} value={f.id}>{mine.includes(f.id) ? '★ ' : ''}{f.name} ({f.variationCount})</option>)}</optgroup>
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
  const total = manifest.families.reduce((a, f) => a + f.variationCount, 0)
  return (
    <div>
      <PageHeader title="Variations" subtitle={`Alle ${total.toLocaleString('nl-NL')} geïmporteerde varianten van de 20 openingen. Kies een opening, filter en oefen iedere variant vanaf de eerste zet.`} />
      <div className="mb-4"><FamilyPicker value={id ?? ''} onChange={v => setSearch({ opening: v })} families={manifest.families} mine={settings.openings} /></div>
      {!file ? <Spinner /> : <VariationBrowser key={file.family.id} file={file} progress={progress} cards={cards} initialFilter="popular" />}
    </div>
  )
}
