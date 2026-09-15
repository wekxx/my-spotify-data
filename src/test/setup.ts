import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
})
