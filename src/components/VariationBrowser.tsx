import { createContext, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeftRight, ChevronRight } from 'lucide-react'
import type { FamilyFile, Variation } from '../lib/types'
import type { TrainingCard, VariationProgress } from '../lib/db'
import { variationMastery } from '../lib/hooks'
import { formatMoves } from '../lib/chess'
import { Stars, pct } from './ui'

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

const TAG_LABEL: Record<string, string> = { base: 'basis', main: 'hoofdvariant', side: 'zijvariant', rare: 'zeldzaam', gambit: 'gambiet', tactical: 'tactisch', sub: 'subvariant' }

interface Props {
  file: FamilyFile
  progress: Map<string, VariationProgress>
  cards: Map<string, TrainingCard>
  initialFilter?: VariationFilter
  /** Wordt aangeroepen als een variant aangewezen of gefocust wordt (voor een voorbeeldbord) */
  onPreview?: (v: Variation | null) => void
}

const FILTERS: VariationFilter[] = ['all', 'main', 'side', 'gambit', 'tactical', 'rare', 'sub', 'new', 'hard', 'mastered']
const PreviewContext = createContext<((v: Variation | null) => void) | undefined>(undefined)

export function VariationBrowser({ file, progress, cards, initialFilter = 'all', onPreview }: Props) {
  const [view, setView] = useState<'tree' | 'list'>(initialFilter === 'popular' ? 'list' : 'tree')
  const [filter, setFilter] = useState<VariationFilter>(initialFilter === 'popular' ? 'all' : initialFilter)
  const [query, setQuery] = useState('')
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
    <PreviewContext.Provider value={onPreview}>
    <div onMouseLeave={() => onPreview?.(null)}>
      <div className="mb-3 flex flex-col gap-2">
        <input className="input min-h-11" type="search" placeholder={`Zoek in ${file.variations.length} varianten: naam, ECO of zetten (bijv. Najdorf of Nf3)`} value={query} onChange={e => setQuery(e.target.value)} aria-label="Zoek variant" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1" role="group" aria-label="Weergave">
            {(['tree', 'list'] as const).map(v => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                {v === 'tree' ? 'Boom' : 'Meest gespeeld'}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor={`filter-${file.family.id}`}>Filter varianten</label>
          <select id={`filter-${file.family.id}`} className="input min-h-11 w-auto max-w-full flex-1 sm:flex-none" value={filter} onChange={e => setFilter(e.target.value as VariationFilter)}>
            {FILTERS.map(f => {
              const count = f === 'all' ? searched.length : searched.filter(v => matches(v, f)).length
              return <option key={f} value={f}>{FILTER_LABEL[f]} ({count})</option>
            })}
          </select>
          {(filter !== 'all' || q) && <button className="btn btn-quiet min-h-11 text-sm" onClick={() => { setFilter('all'); setQuery('') }}>Wis filter</button>}
          <span className="ml-auto text-sm text-muted" aria-live="polite">{sorted.length === file.variations.length ? `${sorted.length} varianten` : `${sorted.length} van ${file.variations.length}`}</span>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">Geen varianten gevonden voor dit filter.</div>
      ) : flat ? (
        <ul className="card divide-y divide-line">
          {sorted.map(v => <VariationRow key={v.id} v={v} file={file} meta={meta.get(v.id)!} progress={progress.get(v.id)} showFull />)}
        </ul>
      ) : (
        <Tree file={file} meta={meta} progress={progress} />
      )}
    </div>
    </PreviewContext.Provider>
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
      <button className="flex min-h-12 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <ChevronRight size={16} aria-hidden className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{learned}/{node.total}</span>
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

function VariationRow({ v, file, meta, progress, label, showFull }: { v: Variation; file: FamilyFile; meta: ReturnType<typeof variationMastery> & { hard: boolean }; progress?: VariationProgress; label?: string; showFull?: boolean }) {
  const title = label ?? (showFull ? (v.path.join(' › ') || file.family.name) : v.path[v.path.length - 1] ?? file.family.name)
  const preview = useContext(PreviewContext)
  return (
    <li>
      <Link to={`/train/${file.family.id}/${v.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2" onMouseEnter={() => preview?.(v)} onFocus={() => preview?.(v)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{title}{v.lineNo && !label ? ` (lijn ${v.lineNo})` : ''}</span>
            <span className="text-xs text-muted">{v.eco}</span>
            {v.tags.filter(t => t !== 'sub').slice(0, 3).map(t => <span key={t} className={`chip chip-sm ${t === 'gambit' ? '!text-accent-ink' : ''}`}>{TAG_LABEL[t]}</span>)}
            {v.transposesTo && <span className="chip chip-sm" title={`Transpositie: ${v.transposesTo.map(t => t.name).slice(0, 3).join('; ')}`}><ArrowLeftRight size={12} aria-hidden />transpositie</span>}
          </div>
          <div className="truncate font-mono text-xs text-muted">{formatMoves(v.san)}</div>
        </div>
        <div className="hidden w-24 shrink-0 text-right text-xs text-muted sm:block" title="Aandeel van de partijen in deze opening dat deze stelling bereikte (Lichess-steekproef)">
          {v.reach !== null ? pct(v.freq, v.freq < 0.01 ? 1 : 0) : '–'}
          <div className="text-xs">{v.reach !== null ? `${v.reach.toLocaleString('nl-NL')} partijen` : 'te zeldzaam'}</div>
        </div>
        <div className="w-16 shrink-0 text-right">
          {meta.mastered ? <span className="chip chip-on chip-sm">beheerst</span> : progress?.bestStars ? <Stars count={progress.bestStars} size="text-sm" /> : <span className="text-xs text-muted">{meta.seen ? `${meta.score}%` : 'nieuw'}</span>}
        </div>
      </Link>
    </li>
  )
}
