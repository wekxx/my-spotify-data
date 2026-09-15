import logoUrl from '../my-spotify-data-logo.png'

export function AppHeader() {
  return <header className="site-header"><a className="brand" href="/" aria-label="My Spotify Data home"><img className="brand-logo" src={logoUrl} alt="" aria-hidden="true"/>My Spotify Data</a></header>
}
