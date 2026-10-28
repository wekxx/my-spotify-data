import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => false) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

afterEach(cleanup)
beforeEach(() => isNativePlatform.mockReturnValue(false))

describe('App landing upload prompt', () => {
  it('opens the file picker from the upload area and shows supported formats', () => {
    const { container } = render(<App />)
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const openPicker = vi.spyOn(fileInput, 'click')

    expect(screen.getByText('Import your Spotify data')).toBeInTheDocument()
    expect(screen.getByText('Drop files here, or tap/click to browse')).toBeInTheDocument()
    expect(screen.getByText('ZIP file')).toBeInTheDocument()
    expect(screen.getByText('Audio JSON files')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose files' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import Spotify data files' }))

    expect(openPicker).toHaveBeenCalledOnce()
  })

  it('says browser processing is local on web', () => {
    render(<App />)
    expect(screen.getByText('Discover your all-time top tracks and artists, listening patterns, and create playlists — all processed locally in your browser.')).toBeInTheDocument()
  })

  it('says app processing is local on Android', () => {
    isNativePlatform.mockReturnValue(true)
    render(<App />)
    expect(screen.getByText('Discover your all-time top tracks and artists, listening patterns, and create playlists — all processed locally in the app.')).toBeInTheDocument()
  })
})
