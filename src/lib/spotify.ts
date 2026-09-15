import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_URL = 'https://api.spotify.com/v1'
const VERIFIER_KEY = 'spotify_pkce_verifier'
const STATE_KEY = 'spotify_oauth_state'
const PENDING_KEY = 'spotify_pending_playlist'
const CLIENT_ID_KEY = 'spotify_client_id'

export const ANDROID_SPOTIFY_REDIRECT_URI = 'com.myspotifydata.android://callback'

export interface PlaylistDraft {
  name: string
  isPublic: boolean
  uris: string[]
}

export interface CreatedPlaylist {
  name: string
  url: string
  tracks: number
}

export type PlaylistFailure = { message: string; playlist?: CreatedPlaylist }

export class PlaylistCreationError extends Error {
  constructor(public playlist: CreatedPlaylist, cause: unknown) {
    super('Spotify created the playlist, but could not add every selected track.')
    this.name = 'PlaylistCreationError'
    this.cause = cause
  }
}

export function isPlaylistCreationError(reason: unknown): reason is PlaylistCreationError {
  return reason instanceof PlaylistCreationError
}

function clientId() {
  const value = sessionStorage.getItem(CLIENT_ID_KEY)?.trim()
  if (!value) throw new Error('Enter your Spotify Client ID before connecting.')
  return value
}

export function spotifyRedirectUri() {
  if (Capacitor.isNativePlatform()) return ANDROID_SPOTIFY_REDIRECT_URI
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || `${location.origin}${location.pathname}`
}

export function spotifyCallbackSearch(url: string) {
  try {
    const callback = new URL(url)
    return `${callback.protocol}//${callback.host}` === ANDROID_SPOTIFY_REDIRECT_URI && ['', '/'].includes(callback.pathname)
      ? callback.search
      : undefined
  } catch {
    return undefined
  }
}

export async function listenForSpotifyNativeCallback(onCallback: (search: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => {}
  let delivered = false
  const deliver = (search: string) => {
    if (delivered) return
    delivered = true
    onCallback(search)
    void Browser.close().catch(() => {})
  }
  const listener = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    const search = spotifyCallbackSearch(url)
    if (!search) return
    deliver(search)
  })
  const launch = await CapacitorApp.getLaunchUrl()
  const launchSearch = launch?.url ? spotifyCallbackSearch(launch.url) : undefined
  if (launchSearch) deliver(launchSearch)
  return () => { void listener.remove() }
}

function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[byte % 66]).join('')
}

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function challenge(verifier: string) {
  return base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}

export async function connectAndCreate(draft: PlaylistDraft, suppliedClientId: string) {
  const value = suppliedClientId.trim()
  if (!value) throw new Error('Enter your Spotify Client ID before connecting.')
  const verifier = randomString(96)
  const state = randomString(32)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(draft))
  sessionStorage.setItem(CLIENT_ID_KEY, value)
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
    state,
    scope: 'playlist-modify-private playlist-modify-public',
  }).toString()
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: url.toString() })
    return
  }
  const popup = window.open(url, 'my-spotify-data-auth', 'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes')
  if (!popup) {
    clearPending()
    throw new Error('Spotify sign-in was blocked. Allow pop-ups for this site, then try again.')
  }
  popup.focus()
}

async function api<T>(path: string, token: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) {
    if (response.status === 429) throw new Error('Spotify is rate limiting requests. Please wait a moment and try again.')
    if (response.status === 403) throw new Error('Spotify denied playlist access. Check the app user list and requested permissions.')
    throw new Error(`Spotify request failed (${response.status}).`)
  }
  return response.status === 204 ? undefined as T : response.json()
}

async function createPlaylist(token: string, draft: PlaylistDraft): Promise<CreatedPlaylist> {
  const playlist = await api<{ id: string; name: string; external_urls: { spotify: string } }>('/me/playlists', token, {
    method: 'POST',
    body: JSON.stringify({ name: draft.name, public: draft.isPublic, description: 'Created with My Spotify Data' }),
  })
  let added = 0
  for (let i = 0; i < draft.uris.length; i += 100) {
    const batch = draft.uris.slice(i, i + 100)
    try {
      await api(`/playlists/${playlist.id}/items`, token, { method: 'POST', body: JSON.stringify({ uris: batch }) })
    } catch (reason) {
      throw new PlaylistCreationError({ name: playlist.name, url: playlist.external_urls.spotify, tracks: added }, reason)
    }
    added += batch.length
  }
  return { name: playlist.name, url: playlist.external_urls.spotify, tracks: added }
}

export function hasSpotifyCallback() {
  const params = new URLSearchParams(location.search)
  return params.has('code') || params.has('error')
}

function clearPending() {
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  sessionStorage.removeItem(CLIENT_ID_KEY)
}

let callbackPromise: Promise<CreatedPlaylist> | undefined

export function finishSpotifyCallback(search = location.search): Promise<CreatedPlaylist> {
  if (!callbackPromise) {
    callbackPromise = completeSpotifyCallback(search)
    callbackPromise.catch((reason) => {
      const failure: PlaylistFailure = isPlaylistCreationError(reason)
        ? { message: `${reason.message} ${reason.cause instanceof Error ? reason.cause.message : ''}`.trim(), playlist: reason.playlist }
        : { message: reason instanceof Error ? reason.message : 'Spotify connection failed.' }
      window.dispatchEvent(new CustomEvent<PlaylistFailure>('my-spotify-data-playlist-failure', { detail: failure }))
    })
    callbackPromise.then(
      () => { callbackPromise = undefined },
      () => { callbackPromise = undefined },
    )
  }
  return callbackPromise
}

async function completeSpotifyCallback(search: string): Promise<CreatedPlaylist> {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  const code = params.get('code')
  const returnedState = params.get('state')
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const expectedState = sessionStorage.getItem(STATE_KEY)
  const pending = sessionStorage.getItem(PENDING_KEY)
  if (search === location.search) history.replaceState({}, '', `${location.pathname}${location.hash}`)
  if (error) { clearPending(); throw new Error(error === 'access_denied' ? 'Spotify connection was cancelled.' : `Spotify authorization failed: ${error}`) }
  if (!code || !verifier || !pending || !returnedState || returnedState !== expectedState) { clearPending(); throw new Error('The Spotify sign-in session expired or could not be verified.') }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), grant_type: 'authorization_code', code, redirect_uri: spotifyRedirectUri(), code_verifier: verifier }),
  })
  if (!response.ok) { clearPending(); throw new Error('Spotify could not complete sign-in. Check the configured redirect URI.') }
  const { access_token } = await response.json() as { access_token: string }
  const draft = JSON.parse(pending) as PlaylistDraft
  try {
    return await createPlaylist(access_token, draft)
  } finally {
    clearPending()
  }
}
