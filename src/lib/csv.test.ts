import { expect, it } from 'vitest'
import { makeCsv } from './csv'
it('creates BOM CSV with escaping and formula protection', () => {
  const csv = makeCsv([{uri:'spotify:track:1',trackName:'=SUM(1,2)',artistName:'Björk "Test"',plays:2}])
  expect(csv.charCodeAt(0)).toBe(0xfeff); expect(csv).toContain('"\'=SUM(1,2)"'); expect(csv).toContain('"Björk ""Test"""')
})
