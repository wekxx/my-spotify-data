import { describe, expect, it } from 'vitest'
import { ANDROID_SPOTIFY_REDIRECT_URI, spotifyCallbackSearch } from './spotify'

describe('Spotify Android callbacks', () => {
  it('uses a dedicated Android redirect URI and accepts only its callback', () => {
    expect(ANDROID_SPOTIFY_REDIRECT_URI).toBe('com.myspotifydata.android://callback')
    expect(spotifyCallbackSearch('com.myspotifydata.android://callback?code=abc&state=xyz')).toBe('?code=abc&state=xyz')
    expect(spotifyCallbackSearch('com.myspotifydata.android://callback/?code=abc&state=xyz')).toBe('?code=abc&state=xyz')
    expect(spotifyCallbackSearch('https://example.com/callback?code=abc')).toBeUndefined()
  })
})
