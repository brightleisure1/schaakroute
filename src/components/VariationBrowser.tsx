import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import type { FamilyFile, Variation } from '../lib/types'
import type { TrainingCard, VariationProgress } from '../lib/db'
import { ThickBar, PILL_HIT, ROW_DIVIDE, ROW_LIST, VariationRow, rowMetaMap, type RowMeta } from './OpeningScreens'

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

/**
 * Eén rij keuzechips (ontwerp 10k) in plaats van een weergaveknop plus uitklaplijst. Eén chip tegelijk:
 * 'Meest gespeeld' = platte lijst op populariteit, 'Boom' = de variantenboom, de rest = filter (platte lijst).
 */
type Choice = 'popular' | 'tree' | Exclude<VariationFilter, 'all' | 'popular'>
const CHOICES: Choice[] = ['popular', 'tree', 'new', 'hard', 'mastered', 'main', 'side', 'gambit', 'tactical', 'rare', 'sub']
const CHOICE_LABEL: Record<Choice, string> = { ...FILTER_LABEL, tree: 'Boom', new: 'Nieuw' }
/** Deze chips staan er altijd; de andere alleen als er varianten bij horen */
const ALWAYS = new Set<Choice>(['popular', 'tree', 'new', 'hard'])

const PAGE = 20

export function VariationBrowser({ file, progress, cards, initialFilter = 'all' }: Props) {
  const [choice, setChoice] = useState<Choice>(initialFilter === 'popular' ? 'popular' : initialFilter === 'all' ? 'tree' : initialFilter)
  const [query, setQuery] = useState('')
  // Lange lijsten in stappen: eerst de 20 meest gespeelde, dan op verzoek meer
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [choice, query])

  const meta = useMemo(() => rowMetaMap(file, progress, cards), [file, progress, cards])

  const matches = (v: Variation, c: Choice) => {
    const m = meta.get(v.id)!
    switch (c) {
      case 'popular': case 'tree': return true
      case 'main': return v.tags.includes('main') || v.tags.includes('base')
      case 'new': return !m.learned
      case 'hard': return m.hard
      case 'mastered': return m.mastered
      default: return v.tags.includes(c)
    }
  }

  const q = query.trim().toLowerCase()
  const searched = q
    ? file.variations.filter(v => v.name.toLowerCase().includes(q) || v.eco.toLowerCase() === q || v.san.join(' ').toLowerCase().includes(q))
    : file.variations
  const list = searched.filter(v => matches(v, choice))
  const flat = choice !== 'tree' || !!q
  const sorted = flat ? [...list].sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1) || a.san.length - b.san.length) : list
  const counts = new Map(CHOICES.map(c => [c, c === 'popular' || c === 'tree' ? searched.length : searched.filter(v => matches(v, c)).length]))
  const shown = CHOICES.filter(c => ALWAYS.has(c) || (counts.get(c) ?? 0) > 0 || c === choice)
  const filtered = choice !== 'popular' && choice !== 'tree'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <label className="flex min-h-[3.125rem] items-center gap-2.5 rounded-[14px] border-2 border-line bg-surface px-3.5 focus-within:border-brand lg:w-md lg:shrink-0">
          <Search size={18} aria-hidden className="shrink-0 text-muted" />
          <span className="sr-only">Zoek in {file.variations.length} varianten</span>
          <input
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none!"
            type="search"
            placeholder="Zoek op naam, ECO of zetten"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        {/* Telefoon: één rij die horizontaal scrolt; desktop: chips lopen door op de volgende regel */}
        <div role="group" aria-label="Weergave en filter" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 scrollbar-thin sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          {shown.map(c => {
            const on = c === choice
            const n = counts.get(c) ?? 0
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => setChoice(c)} className={`pill ${on ? 'pill-on' : ''} ${PILL_HIT}`}>
                {CHOICE_LABEL[c]}
                {c !== 'popular' && c !== 'tree' && <span className={`text-xs font-semibold tabular-nums ${on ? '' : 'text-muted'}`}><span className="sr-only">(</span>{n}<span className="sr-only"> varianten)</span></span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">{sorted.length === file.variations.length ? `${sorted.length} varianten` : `${sorted.length} van ${file.variations.length} varianten`}{choice === 'tree' && q ? ' · zoekresultaten als lijst' : ''}</p>
        {(filtered || q) && <button type="button" className="btn btn-quiet min-h-11 shrink-0 text-sm" onClick={() => { setChoice('popular'); setQuery('') }}>Wis filter</button>}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-[18px] border-2 border-line bg-surface p-6 text-center text-sm text-muted">Geen varianten gevonden voor dit filter.</div>
      ) : flat ? (
        <ul className={`${ROW_LIST} ${ROW_DIVIDE}`}>
          {sorted.slice(0, limit).map((v, i) => <VariationRow key={v.id} v={v} file={file} status={meta.get(v.id)!.status} shareSuffix={i === 0} />)}
          {sorted.length > limit && (
            <li className="flex flex-wrap items-center gap-2 p-3">
              <button type="button" className="btn btn-ghost min-h-11" onClick={() => setLimit(l => l + PAGE)}>Toon {Math.min(PAGE, sorted.length - limit)} meer</button>
              {sorted.length - limit > PAGE && <button type="button" className="btn btn-quiet min-h-11" onClick={() => setLimit(sorted.length)}>Toon alle {sorted.length}</button>}
              <span className="ml-auto text-sm text-muted">{limit} van {sorted.length}</span>
            </li>
          )}
        </ul>
      ) : (
        <Tree file={file} meta={meta} />
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

type MetaMap = Map<string, RowMeta>

function Tree({ file, meta }: { file: FamilyFile; meta: MetaMap }) {
  const tree = useMemo(() => buildTree(file), [file])
  return (
    <div className={ROW_LIST}>
      {tree.variations.length > 0 && (
        <ul className={`${ROW_DIVIDE} border-b-2 border-surface-2`}>
          {tree.variations.map(v => <VariationRow key={v.id} v={v} file={file} status={meta.get(v.id)!.status} />)}
        </ul>
      )}
      <Branch node={tree} file={file} meta={meta} depth={0} />
    </div>
  )
}

function Branch({ node, file, meta, depth }: { node: TreeNode; file: FamilyFile; meta: MetaMap; depth: number }) {
  const kids = [...node.children.values()].sort((a, b) => reachOfNode(b) - reachOfNode(a) || a.name.localeCompare(b.name))
  return (
    <ul className={depth ? 'border-l-2 border-surface-2' : ROW_DIVIDE} style={depth ? { marginLeft: 14 } : undefined}>
      {kids.map(k => <Group key={k.key} node={k} file={file} meta={meta} depth={depth} />)}
    </ul>
  )
}

function collect(n: TreeNode): Variation[] {
  return [...n.variations, ...[...n.children.values()].flatMap(collect)]
}

function Group({ node, file, meta, depth }: { node: TreeNode; file: FamilyFile; meta: MetaMap; depth: number }) {
  const [open, setOpen] = useState(false)
  const all = useMemo(() => collect(node), [node])
  const learned = all.filter(v => meta.get(v.id)?.learned).length
  const single = node.total === 1 && node.variations.length === 1 && node.children.size === 0
  if (single) return <VariationRow v={node.variations[0]} file={file} status={meta.get(node.variations[0].id)!.status} label={node.name} />
  return (
    <li>
      <button type="button" className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 focus-visible:-outline-offset-2! lg:px-4.5" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <ChevronRight size={18} aria-hidden className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1"><span className="line-clamp-2 block font-bold leading-snug lg:truncate">{node.name}</span><span className="block text-sm text-muted">{node.total} varianten</span></span>
        <span className="flex w-20 shrink-0 items-center gap-2 sm:w-28 lg:w-40"><ThickBar value={learned / node.total} label={`${node.name}: ${learned} van ${node.total} geleerd`} className="flex-1" /><span className="w-10 text-right text-xs font-semibold tabular-nums text-muted">{learned}/{node.total}</span></span>
      </button>
      {open && (
        <div className="pb-1">
          {node.variations.length > 0 && (
            <ul style={{ marginLeft: 14 }} className="border-l-2 border-surface-2">
              {node.variations.map(v => <VariationRow key={v.id} v={v} file={file} status={meta.get(v.id)!.status} label={v.lineNo ? `${node.name} (lijn ${v.lineNo})` : 'Hoofdlijn'} />)}
            </ul>
          )}
          <Branch node={node} file={file} meta={meta} depth={depth + 1} />
        </div>
      )}
    </li>
  )
}
