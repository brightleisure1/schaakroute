#!/usr/bin/env node
// Kopieert de (optionele) Stockfish-engine uit het npm-pakket 'stockfish' (GPLv3) naar public/engine,
// samen met de licentietekst en een verwijzing naar de volledige corresponderende broncode.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('node_modules/stockfish/package.json', 'utf8'))
mkdirSync('public/engine', { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copyFileSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`)
copyFileSync('node_modules/stockfish/Copying.txt', 'public/engine/COPYING.txt')
writeFileSync('public/engine/SOURCE.md', `# Stockfish in SchaakRoute

SchaakRoute bevat optioneel **Stockfish ${pkg.buildVersion}** (lite, single-threaded WebAssembly-build) uit het
npm-pakket \`stockfish@${pkg.version}\` van Nathan Rugg (stockfish.js), ongewijzigd.

- Licentie: GNU General Public License v3 — zie COPYING.txt in deze map.
- Volledige corresponderende broncode van deze build: https://github.com/nmrugg/stockfish.js/tree/v${pkg.version}
  (release-bestanden: https://github.com/nmrugg/stockfish.js/releases/tag/v${pkg.version})
- Stockfish-broncode: https://github.com/official-stockfish/Stockfish
- SchaakRoute zelf is ook gelicenseerd onder GPL-3.0-or-later; de broncode staat in deze repository.

De engine draait volledig lokaal in een Web Worker. Er wordt geen externe analyseserver gebruikt.
`)
console.log('Stockfish gekopieerd naar public/engine')
