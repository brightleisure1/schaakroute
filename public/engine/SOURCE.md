# Stockfish in SchaakRoute

SchaakRoute bevat optioneel **Stockfish 19** (lite, single-threaded WebAssembly-build) uit het
npm-pakket `stockfish@19.0.1` van Nathan Rugg (stockfish.js), ongewijzigd.

- Licentie: GNU General Public License v3 — zie COPYING.txt in deze map.
- Volledige corresponderende broncode van deze build: https://github.com/nmrugg/stockfish.js/tree/v19.0.1
  (release-bestanden: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1)
- Stockfish-broncode: https://github.com/official-stockfish/Stockfish
- SchaakRoute zelf is ook gelicenseerd onder GPL-3.0-or-later; de broncode staat in deze repository.

De engine draait volledig lokaal in een Web Worker. Er wordt geen externe analyseserver gebruikt.
