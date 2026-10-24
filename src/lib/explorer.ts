// Optionele live Lichess Opening Explorer (https://explorer.lichess.org).
// Sinds 2025 vereist deze endpoint een (gratis) persoonlijk Lichess-token. Zonder token gebruikt de app
// uitsluitend de offline statistieken uit de partijensteekproef. Resultaten worden per sessie gecachet
// en verzoeken worden één voor één gedaan om de rate limits te respecteren.

export interface ExplorerMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  averageRating?: number
}

export interface ExplorerResult {
  white: number
  draws: number
  black: number
  moves: ExplorerMove[]
  opening?: { eco: string; name: string } | null
}

const cache = new Map<string, ExplorerResult>()
let last = 0
let blockedUntil = 0

export const RATING_GROUPS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]

export function ratingGroupsFor(elo: number): number[] {
  // de groep van de speler plus de groep erboven en eronder
  const i = Math.max(0, RATING_GROUPS.findLastIndex(r => elo >= r))
  return RATING_GROUPS.slice(Math.max(0, i - 1), i + 2)
}

export async function queryExplorer(fen: string, token: string, opts: { ratings?: number[]; speeds?: string[] } = {}): Promise<ExplorerResult> {
  if (!token) throw new Error('Geen Lichess-token ingesteld')
  const params = new URLSearchParams({
    variant: 'standard',
    fen,
    moves: '12',
    topGames: '0',
    recentGames: '0',
    speeds: (opts.speeds ?? ['blitz', 'rapid', 'classical']).join(','),
  })
  if (opts.ratings?.length) params.set('ratings', opts.ratings.join(','))
  const key = params.toString()
  const hit = cache.get(key)
  if (hit) return hit
  if (Date.now() < blockedUntil) throw new Error('Lichess vraagt om even te wachten (rate limit). Probeer het over een minuut opnieuw.')
  const wait = Math.max(0, last + 1000 - Date.now())
  if (wait) await new Promise(r => setTimeout(r, wait))
  last = Date.now()
  const res = await fetch(`https://explorer.lichess.org/lichess?${key}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 429) {
    blockedUntil = Date.now() + 60_000
    throw new Error('Rate limit van Lichess bereikt; wacht een minuut.')
  }
  if (res.status === 401) throw new Error('Lichess weigert het token (401). Controleer je persoonlijke token.')
  if (!res.ok) throw new Error(`Lichess Explorer gaf foutcode ${res.status}`)
  const data = (await res.json()) as ExplorerResult
  cache.set(key, data)
  return data
}
