// Gedeelde, transparante regels voor het indelen van Lichess-openingsnamen in families.
// Wordt gebruikt door het importscript én door de tests, zodat de regels op één plek staan.

export const SYSTEM_RULES = [
  // Systemen die Lichess onder verschillende hoofdnamen opslaat (bijv. "Queen's Pawn Game: London System"
  // en "Indian Defense: London System"). Een naam die het systeem bevat, hoort bij dat systeem.
  { pattern: /London System/, family: 'London System' },
  { pattern: /King's Indian Attack/, family: "King's Indian Attack" },
  { pattern: /Colle System/, family: 'Colle System' },
  { pattern: /Torre Attack/, family: 'Torre Attack' },
]

// Expliciete aliassen voor namen waarvan de basisnaam zelf geen Lichess-familie is.
export const ALIASES = {
  'Vienna Gambit': 'Vienna Game',
}

// Generieke verzamelnamen: Lichess gebruikt deze voor stellingen zonder herkenbare opening.
// Ze worden wel geteld en getoond in de ranglijst, maar niet geselecteerd als te leren opening.
export const GENERIC_FAMILIES = {
  "King's Pawn Game": 'verzamelnaam voor 1.e4 e5-stellingen zonder benoemde opening',
  "Queen's Pawn Game": 'verzamelnaam voor 1.d4-stellingen zonder benoemde opening',
  'Indian Defense': 'verzamelnaam voor 1.d4 Nf6-stellingen zonder benoemde opening',
  'Zukertort Opening': 'verzamelnaam voor 1.Nf3-stellingen zonder benoemde opening',
  "Van't Kruijs Opening": 'verzamelnaam voor 1.e3 zonder vervolgsysteem',
}

export function normalizeName(name) {
  return name
    .normalize('NFC')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*:\s*/g, ': ')
    .trim()
}

export function prefixOf(name) {
  const i = name.indexOf(':')
  return i === -1 ? name : name.slice(0, i)
}

/** Bouwt een functie name -> familie op basis van alle bekende prefixen. */
export function makeFamilyResolver(allNames) {
  const prefixes = new Set(allNames.map(n => prefixOf(normalizeName(n))))
  const baseOf = prefix => {
    let p = prefix
    const withIdx = p.indexOf(', with ')
    if (withIdx > 0 && prefixes.has(p.slice(0, withIdx))) p = p.slice(0, withIdx)
    const m = p.match(/^(.*) (Accepted|Declined)$/)
    if (m && prefixes.has(m[1])) p = m[1]
    if (ALIASES[p]) p = ALIASES[p]
    if (withIdx > 0 && ALIASES[prefix.slice(0, withIdx)]) p = ALIASES[prefix.slice(0, withIdx)]
    return p
  }
  return function familyOf(rawName) {
    const name = normalizeName(rawName)
    for (const r of SYSTEM_RULES) if (r.pattern.test(name)) return r.family
    return baseOf(prefixOf(name))
  }
}

/** Pad (hiërarchie van namen) van een variant binnen zijn familie. */
export function variationPath(rawName, family) {
  const name = normalizeName(rawName)
  const prefix = prefixOf(name)
  const rest = name.includes(':') ? name.slice(name.indexOf(':') + 1).trim() : ''
  const parts = []
  if (prefix !== family) {
    if (prefix.startsWith(family + ', ')) parts.push(prefix.slice(family.length + 2))
    else parts.push(prefix)
  }
  if (rest) parts.push(...rest.split(', ').map(s => s.trim()).filter(Boolean))
  // Voor systemen (bijv. "Queen's Pawn Game: London System") is het systeem zelf geen extra niveau.
  return parts.filter(p => p !== family)
}

export function slugify(s) {
  return normalizeName(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
