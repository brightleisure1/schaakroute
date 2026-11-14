import { Link, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useCardMap, useFamily, useManifest, useProgressMap } from '../lib/hooks'
import { VariationBrowser } from '../components/VariationBrowser'
import { OpeningSwitcher } from '../components/OpeningScreens'
import { ErrorBox, Spinner, useSettings } from '../components/ui'
import type { FamilySummary } from '../lib/types'

/** Uitklaplijst met openingen; nog in gebruik bij Afstraffen en Op jouw niveau */
export function FamilyPicker({ value, onChange, families, mine }: { value: string; onChange: (id: string) => void; families: FamilySummary[]; mine: string[] }) {
  const sorted = [...families].sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)))
  return (
    <select className="input min-h-11 sm:max-w-sm" value={value} onChange={e => onChange(e.target.value)} aria-label="Kies opening">
      <optgroup label="Wit">{sorted.filter(f => f.side === 'white').map(f => <option key={f.id} value={f.id}>{f.name} ({f.variationCount}){mine.includes(f.id) ? ' · mijn opening' : ''}</option>)}</optgroup>
      <optgroup label="Zwart">{sorted.filter(f => f.side === 'black').map(f => <option key={f.id} value={f.id}>{f.name} ({f.variationCount}){mine.includes(f.id) ? ' · mijn opening' : ''}</option>)}</optgroup>
    </select>
  )
}

// Varianten (ontwerp 10k): één tikbare openingskaart in plaats van uitklaplijsten, daaronder zoeken,
// een rij keuzechips (weergave en filters) en de lijst.

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
  // Met een gekozen opening (ook vanaf de openingspagina): terug naar die opening
  const fam = search.get('opening') ? manifest.families.find(f => f.id === id) : undefined
  return (
    <div className="flex flex-col gap-4">
      <header>
        {fam && <Link to={`/opening/${fam.id}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden />{fam.name}</Link>}
        <h1 className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.03em] lg:text-4xl">Varianten</h1>
      </header>
      <div className="lg:max-w-md">
        <OpeningSwitcher value={id} families={manifest.families} mine={settings.openings} onChange={v => setSearch({ opening: v })} />
      </div>
      {!file || file.family.id !== id ? <Spinner /> : <VariationBrowser key={file.family.id} file={file} progress={progress} cards={cards} initialFilter="popular" />}
    </div>
  )
}
