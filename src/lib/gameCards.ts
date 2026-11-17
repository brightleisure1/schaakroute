import type { CardSource, TrainingCard } from './db'
import { playerName } from './review'
import { locale, t } from './i18n'

/** Filterwaarde in Herhalen voor de fouten uit je eigen partijen */
export const GAMES_FILTER = '__games'

/** Hoort deze kaart bij het gekozen filter in Herhalen ('' = alles, GAMES_FILTER = fouten uit partijen, anders een opening) */
export function inReviewFilter(c: TrainingCard, filter: string): boolean {
  if (!filter) return true
  if (filter === GAMES_FILTER) return c.source?.kind === 'game'
  return c.familyIds.includes(filter)
}

/** Kop en uitleg voor een fout uit je eigen partij, in de training */
export function gameCardText(s: CardSource) {
  const date = new Date(s.playedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
  return {
    title: t('Je partij tegen {name}', { name: playerName(s.opponent) }),
    sub: t('Uit je partij van {date}. Vind de betere zet.', { date }),
    short: t('Tegen {name}', { name: playerName(s.opponent) }),
    date,
    /** Voor de training: eerst deze zet laten zien als fout, dan terugnemen */
    replay: { san: s.played, label: s.cls === 'blunder' ? t('blunder') : s.cls === 'miss' ? t('gemiste kans') : t('fout') },
  }
}
