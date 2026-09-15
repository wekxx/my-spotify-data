import { unzipSync } from 'fflate'
import type { InputFile } from '../types'

const MAX_ARCHIVE = 200 * 1024 * 1024
const MAX_EXPANDED = 1024 * 1024 * 1024
const MAX_RATIO = 200
const MAX_ENTRIES = 10_000

function u16(v: DataView, p: number) { return v.getUint16(p, true) }
function u32(v: DataView, p: number) { return v.getUint32(p, true) }

export function inspectZip(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_ARCHIVE) throw new Error('ZIP files must be 200 MB or smaller.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65_557); p--) if (u32(view, p) === 0x06054b50) { eocd = p; break }
  if (eocd < 0) throw new Error('The ZIP is corrupted or unsupported.')
  const count = u16(view, eocd + 10)
  if (count > MAX_ENTRIES) throw new Error('The ZIP contains too many entries.')
  let p = u32(view, eocd + 16), total = 0
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || u32(view, p) !== 0x02014b50) throw new Error('The ZIP directory is invalid.')
    const flags = u16(view, p + 8), method = u16(view, p + 10), compressed = u32(view, p + 20), expanded = u32(view, p + 24)
    const nl = u16(view, p + 28), el = u16(view, p + 30), cl = u16(view, p + 32)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/')
    if (flags & 1) throw new Error('Encrypted ZIP archives are not supported.')
    if (![0, 8].includes(method)) throw new Error('The ZIP uses unsupported compression.')
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..')) throw new Error('The ZIP contains an unsafe path.')
    total += expanded
    if (total > MAX_EXPANDED || (compressed > 0 && expanded / compressed > MAX_RATIO)) throw new Error('The ZIP expands beyond safe memory limits.')
    names.push(name); p += 46 + nl + el + cl
  }
  return names
}

export function extractZip(bytes: Uint8Array): InputFile[] {
  inspectZip(bytes)
  let output: Record<string, Uint8Array>
  try {
    output = unzipSync(bytes, { filter: (file) => /Streaming_History_Audio_.*\.json$/i.test(file.name) })
  } catch { throw new Error('The ZIP is corrupted or could not be decompressed.') }
  return Object.entries(output).map(([name, data]) => ({ name, bytes: data }))
}
