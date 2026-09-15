import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractZip, inspectZip } from './zip'
const enc = new TextEncoder()
describe('ZIP handling',()=>{
  it('extracts only supported audio history entries',()=>{const zip=zipSync({'Spotify Extended Streaming History/Streaming_History_Audio_2024.json':enc.encode('[]'),'notes.txt':enc.encode('private-looking')});const files=extractZip(zip);expect(files).toHaveLength(1);expect(files[0]).toMatchObject({name:'Spotify Extended Streaming History/Streaming_History_Audio_2024.json'});expect(new TextDecoder().decode(files[0].bytes)).toBe('[]')})
  it('rejects unsafe paths',()=>{const zip=zipSync({'../Streaming_History_Audio_2024.json':enc.encode('[]')});expect(()=>inspectZip(zip)).toThrow(/unsafe path/)})
})
