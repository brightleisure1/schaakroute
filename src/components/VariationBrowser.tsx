import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { FamilyFile, Variation } from '../lib/types'
import type { TrainingCard, VariationProgress } from '../lib/db'
import { variationMastery } from '../lib/hooks'
import { ProgressBar } from './ui'
import { VariationItem, type VariationStatus } from './VariationItem'

export type VariationFilter = 'all' | 'popular' | 'main' | 'side' | 'gambit' | 'tactical' | 'rare' | 'sub' | 'new' | 'hard' | 'mastered'

export const FILTER_LABEL: Record<VariationFilter, string> = {
  all: 'Alle varianten',
  popular: 'Meest gespeeld',
  main: 'Hoofdvarianten',
  side: 'Zijvarianten',
  gambit: 'Gambieten',
  tactical: 'Tactisch',
  rare: 'Minder gebruikelijk',
  sub: 'Subvarianten',
  new: 'Nog niet geleerd',
  hard: 'Moeilijk',
  mastered: 'Beheerst',
}

interface Props {
  file: FamilyFile
  progress: Map<string, VariationProgress>
  cards: Map<string, TrainingCard>
  initialFilter?: VariationFilter
}

const PAGE = 20
const FILTERS: VariationFilter[] = ['all', 'main', 'side', 'gambit', 'tactical', 'rare', 'sub', 'new', 'hard', 'mastered']

export function VariationBrowser({ file, progress, cards, initialFilter = 'all' }: Props) {
  const [view, setView] = useState<'tree' | 'list'>(initialFilter === 'popular' ? 'list' : 'tree')
  const [filter, setFilter] = useState<VariationFilter>(initialFilter === 'popular' ? 'all' : initialFilter)
  const [query, setQuery] = useState('')
  // Lange lijsten in stappen: eerst de 20 meest gespeelde, dan op verzoek meer
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [view, filter, query])
  const side = file.family.side

  const meta = useMemo(() => {
    const m = new Map<string, ReturnType<typeof variationMastery> & { hard: boolean }>()
    const lapsed = new Set<string>()
    for (const c of cards.values()) if (c.lapses >= 2) for (const id of c.variationIds) lapsed.add(id)
    for (const v of file.variations) {
      const p = progress.get(v.id)
      const vm = variationMastery(v, side, cards, p)
      const lapses = lapsed.has(v.id)
      m.set(v.id, { ...vm, hard: (!!p && p.completions > 0 && p.mistakes / p.completions >= 1) || lapses })
    }
    return m
  }, [file, progress, cards, side])

  const matches = (v: Variation, f: VariationFilter) => {
    const m = meta.get(v.id)!
    switch (f) {
      case 'all': case 'popular': return true
      case 'main': return v.tags.includes('main') || v.tags.includes('base')
      case 'new': return !m.learned
      case 'hard': return m.hard
      case 'mastered': return m.mastered
      default: return v.tags.includes(f)
    }
  }

  const q = query.trim().toLowerCase()
  const searched = q
    ? file.variations.filter(v => v.name.toLowerCase().includes(q) || v.eco.toLowerCase() === q || v.san.join(' ').toLowerCase().includes(q))
    : file.variations
  const list = searched.filter(v => matches(v, filter))
  const flat = view === 'list' || filter !== 'all' || !!q
  const sorted = flat ? [...list].sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1) || a.san.length - b.san.length) : list

  return (
    <div>
      {/* Telefoon: onder elkaar; desktop: zoeken, weergave en filter op één regel */}
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center">
        <input className="input min-h-11 lg:flex-1" type="search" placeholder={`Zoek in ${file.variations.length} varianten: naam, ECO of zetten (bijv. Najdorf of Nf3)`} value={query} onChange={e => setQuery(e.target.value)} aria-label="Zoek variant" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex shrink-0 rounded-xl border border-line bg-surface-2 p-1" role="group" aria-label="Weergave">
            {(['tree', 'list'] as const).map(v => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                {v === 'tree' ? 'Boom' : 'Meest gespeeld'}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor={`filter-${file.family.id}`}>Filter varianten</label>
          <select id={`filter-${file.family.id}`} className="input min-h-11 w-full sm:w-56" value={filter} onChange={e => setFilter(e.target.value as VariationFilter)}>
            {FILTERS.map(f => {
              const count = f === 'all' ? searched.length : searched.filter(v => matches(v, f)).length
              return <option key={f} value={f}>{FILTER_LABEL[f]} ({count})</option>
            })}
          </select>
          {(filter !== 'all' || q) && <button className="btn btn-quiet min-h-11 shrink-0 text-sm" onClick={() => { setFilter('all'); setQuery('') }}>Wis filter</button>}
        </div>
      </div>
      <p className="mb-3 text-sm text-muted" aria-live="polite">{sorted.length === file.variations.length ? `${sorted.length} varianten` : `${sorted.length} van ${file.variations.length} varianten`}</p>
      {sorted.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">Geen varianten gevonden voor dit filter.</div>
      ) : flat ? (
        <ul className="card divide-y divide-line">
          {sorted.slice(0, limit).map(v => <VariationRow key={v.id} v={v} file={file} meta={meta.get(v.id)!} progress={progress.get(v.id)} showFull />)}
          {sorted.length > limit && (
            <li className="flex flex-wrap items-center gap-2 p-3">
              <button className="btn btn-ghost min-h-11" onClick={() => setLimit(l => l + PAGE)}>Toon {Math.min(PAGE, sorted.length - limit)} meer</button>
              {sorted.length - limit > PAGE && <button className="btn btn-quiet min-h-11" onClick={() => setLimit(sorted.length)}>Toon alle {sorted.length}</button>}
              <span className="ml-auto text-sm text-muted">{limit} van {sorted.length}</span>
            </li>
          )}
        </ul>
      ) : (
        <Tree file={file} meta={meta} progress={progress} />
      )}
    </div>
  )
}

interface TreeNode {
  name: string
  key: string
  variations: Variation[]
  children: Map<string, TreeNode>
  total: number
}

function buildTree(file: FamilyFile): TreeNode {
  const root: TreeNode = { name: file.family.name, key: '', variations: [], children: new Map(), total: 0 }
  for (const v of file.variations) {
    let node = root
    node.total++
    for (const part of v.path) {
      let child = node.children.get(part)
      if (!child) {
        child = { name: part, key: node.key + '>' + part, variations: [], children: new Map(), total: 0 }
        node.children.set(part, child)
      }
      child.total++
      node = child
    }
    node.variations.push(v)
  }
  return root
}

function reachOfNode(n: TreeNode): number {
  return Math.max(0, ...n.variations.map(v => v.reach ?? 0), ...[...n.children.values()].map(reachOfNode))
}

function Tree({ file, meta, progress }: { file: FamilyFile; meta: Map<string, ReturnType<typeof variationMastery> & { hard: boolean }>; progress: Map<string, VariationProgress> }) {
  const tree = useMemo(() => buildTree(file), [file])
  return (
    <div className="card overflow-hidden">
      {tree.variations.length > 0 && (
        <ul className="divide-y divide-line border-b border-line">
          {tree.variations.map(v => <VariationRow key={v.id} v={v} file={file} meta={meta.get(v.id)!} progress={progress.get(v.id)} />)}
        </ul>
      )}
      <Branch node={tree} file={file} meta={meta} progress={progress} depth={0} />
    </div>
  )
}

function Branch({ node, file, meta, progress, depth }: { node: TreeNode; file: FamilyFile; meta: Map<string, ReturnType<typeof variationMastery> & { hard: boolean }>; progress: Map<string, VariationProgress>; depth: number }) {
  const kids = [...node.children.values()].sort((a, b) => reachOfNode(b) - reachOfNode(a) || a.name.localeCompare(b.name))
  return (
    <ul className={depth ? 'border-l border-line' : 'divide-y divide-line'} style={depth ? { marginLeft: 14 } : undefined}>
      {kids.map(k => <Group key={k.key} node={k} file={file} meta={meta} progress={progress} depth={depth} />)}
    </ul>
  )
}

function collect(n: TreeNode): Variation[] {
  return [...n.variations, ...[...n.children.values()].flatMap(collect)]
}

function Group({ node, file, meta, progress, depth }: { node: TreeNode; file: FamilyFile; meta: Map<string, ReturnType<typeof variationMastery> & { hard: boolean }>; progress: Map<string, VariationProgress>; depth: number }) {
  const [open, setOpen] = useState(false)
  const all = useMemo(() => collect(node), [node])
  const learned = all.filter(v => meta.get(v.id)?.learned).length
  const single = node.total === 1 && node.variations.length === 1 && node.children.size === 0
  if (single) return <VariationRow v={node.variations[0]} file={file} meta={meta.get(node.variations[0].id)!} progress={progress.get(node.variations[0].id)} label={node.name} />
  return (
    <li>
      <button className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2 lg:px-4.5" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <ChevronRight size={18} aria-hidden className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1"><span className="line-clamp-2 block font-bold leading-snug lg:truncate">{node.name}</span><span className="block text-sm text-muted">{node.total} varianten</span></span>
        <span className="flex w-20 shrink-0 items-center gap-2 sm:w-28 lg:w-40"><ProgressBar value={learned / node.total} className="flex-1" /><span className="w-10 text-right text-xs font-semibold tabular-nums text-muted">{learned}/{node.total}</span></span>
      </button>
      {open && (
        <div className="pb-1">
          {node.variations.length > 0 && (
            <ul style={{ marginLeft: 14 }} className="border-l border-line">
              {node.variations.map(v => <VariationRow key={v.id} v={v} file={file} meta={meta.get(v.id)!} progress={progress.get(v.id)} label={v.lineNo ? `${node.name} (lijn ${v.lineNo})` : 'Hoofdlijn'} />)}
            </ul>
          )}
          <Branch node={node} file={file} meta={meta} progress={progress} depth={depth + 1} />
        </div>
      )}
    </li>
  )
}

/** Een variant in de lijst of boom: dezelfde regel als op de openingspagina */
function VariationRow({ v, file, meta, label }: { v: Variation; file: FamilyFile; meta: ReturnType<typeof variationMastery> & { hard: boolean }; progress?: VariationProgress; label?: string; showFull?: boolean }) {
  const status: VariationStatus = meta.hard ? 'hard' : meta.mastered ? 'mastered' : meta.learned ? 'learned' : 'new'
  return <VariationItem v={v} file={file} status={status} label={label} />
}
