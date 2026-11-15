import { defineConfig } from 'vitest/config'

// Aparte configuratie voor het trainingsscript van de zetbeoordeling (npm run fit:classifier)
export default defineConfig({
  test: { environment: 'node', include: ['scripts/fit-classifier.test.ts'], testTimeout: 0, hookTimeout: 0 },
})
