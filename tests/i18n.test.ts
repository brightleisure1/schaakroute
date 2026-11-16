import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EN } from '../src/i18n/en'
import { setLang, t, tn } from '../src/lib/i18n'

// Elke tekst die via t()/tn() door de app gaat moet een Engelse vertaling hebben, met dezelfde {variabelen}.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return p.includes('i18n') ? [] : files(p)
    if (p.endsWith('i18n.ts')) return []
    return /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

/** Alle letterlijke teksten in t('…'), t("…"), t(`…`) en tn(n, '…', '…') */
function keys(): { key: string; file: string }[] {
  const out: { key: string; file: string }[] = []
  const str = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`
  const one = new RegExp(String.raw`\bt\(\s*(?:${str})`, 'g')
  const two = new RegExp(String.raw`\btn\([^,]+,\s*(?:${str})\s*,\s*(?:${str})`, 'g')
  for (const file of files('src')) {
    const src = readFileSync(file, 'utf8')
    const unescape = (s: string) => s.replace(/\\(.)/g, '$1')
    for (const m of src.matchAll(one)) { const k = m[1] ?? m[2] ?? m[3]; if (k !== undefined) out.push({ key: unescape(k), file }) }
    for (const m of src.matchAll(two)) for (const k of [m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6]]) if (k !== undefined) out.push({ key: unescape(k), file })
  }
  return out
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')

describe('Engelse vertaling', () => {
  it('heeft voor elke tekst in de code een vertaling', () => {
    const missing = keys().filter(k => !(k.key in EN)).map(k => `${k.file}: ${k.key}`)
    expect([...new Set(missing)]).toEqual([])
  })
  it('gebruikt in de vertaling dezelfde variabelen', () => {
    const wrong = Object.entries(EN).filter(([nl, en]) => vars(nl) !== vars(en)).map(([nl]) => nl)
    expect(wrong).toEqual([])
  })
  it('vertaalt en vult variabelen in', () => {
    setLang('nl')
    expect(t('{n} van {m}', { n: 1, m: 2 })).toBe('1 van 2')
    expect(tn(1, '{n} positie', '{n} posities')).toBe('1 positie')
    setLang('nl')
  })
})
