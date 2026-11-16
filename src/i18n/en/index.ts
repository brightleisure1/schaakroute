import { app } from './app'
import { training } from './training'
import { analysis } from './analysis'
import { openings } from './openings'
import { content } from './content'

/** Alle Engelse vertalingen samen: Nederlandse tekst → Engelse tekst */
export const EN: Record<string, string> = { ...content, ...openings, ...analysis, ...training, ...app }
