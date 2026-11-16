import { EN } from '../i18n/en'

// Vertaling: de app is in het Nederlands geschreven; de Nederlandse tekst is zelf de sleutel.
// t('Start de dagtraining') geeft in het Engels de vertaling uit src/i18n/en, en valt anders terug op het Nederlands.
// Variabelen: t('{n} posities', { n: 3 }). Voor stukken met opmaak erin: tr(<>…</>, <>…</>).

export type Lang = 'nl' | 'en'

let current: Lang = 'nl'

export const getLang = (): Lang => current

/** Wordt bij elke render van de app gezet vanuit de instellingen (zie Shell in App.tsx) */
export function setLang(l: Lang) {
  current = l
  if (typeof document !== 'undefined' && document.documentElement.lang !== l) document.documentElement.lang = l
}

export function t(nl: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? (EN[nl] ?? nl) : nl
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

/** Kies per taal; voor zinnen met JSX erin of samengestelde tekst */
export const tr = <T,>(nl: T, en: T): T => (current === 'en' ? en : nl)

/** Enkelvoud of meervoud: tn(n, '{n} positie', '{n} posities'); beide vormen staan los in het woordenboek */
export const tn = (n: number, one: string, many: string, vars?: Record<string, string | number>) => t(n === 1 ? one : many, { n, ...vars })

/** Taalcode voor datums en getallen (toLocaleDateString, Intl) */
export const locale = () => (current === 'en' ? 'en-GB' : 'nl-NL')

/** Standaardtaal voor iemand die nog niets koos: Nederlands op een Nederlands apparaat, anders Engels */
export function deviceLang(): Lang {
  const l = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return /^nl\b/i.test(l) ? 'nl' : 'en'
}
