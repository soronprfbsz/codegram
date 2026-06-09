import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We re-import the store freshly for each test by resetting the module registry.
// This ensures the store's initializer (which reads localStorage) re-runs.

describe('useThemeStore', () => {
  let localStorageMock: Record<string, string> = {}

  beforeEach(() => {
    // Reset document class state
    document.documentElement.className = ''

    // Fresh localStorage mock each test
    localStorageMock = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key) => localStorageMock[key] ?? null,
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      localStorageMock[key] = value
    })

    // Reset module so the store re-reads localStorage on import
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function getStore() {
    const { useThemeStore } = await import('./theme')
    return useThemeStore
  }

  it('defaults to dark when localStorage is empty', async () => {
    const store = await getStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('restores light from localStorage', async () => {
    localStorageMock['erd-theme'] = 'light'
    const store = await getStore()
    expect(store.getState().theme).toBe('light')
  })

  it('toggle flips dark → light, updates localStorage, and toggles .dark class', async () => {
    const store = await getStore()
    // initial: dark — class should be applied by the store init
    store.getState().toggle()

    expect(store.getState().theme).toBe('light')
    expect(localStorageMock['erd-theme']).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggle flips light → dark', async () => {
    localStorageMock['erd-theme'] = 'light'
    const store = await getStore()
    store.getState().toggle()

    expect(store.getState().theme).toBe('dark')
    expect(localStorageMock['erd-theme']).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme persists and applies class', async () => {
    const store = await getStore()
    store.getState().setTheme('light')

    expect(store.getState().theme).toBe('light')
    expect(localStorageMock['erd-theme']).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    store.getState().setTheme('dark')
    expect(store.getState().theme).toBe('dark')
    expect(localStorageMock['erd-theme']).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

describe('applyStoredTheme', () => {
  let localStorageMock: Record<string, string> = {}

  beforeEach(() => {
    document.documentElement.className = ''
    localStorageMock = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key) => localStorageMock[key] ?? null,
    )
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds .dark when no storage key', async () => {
    const { applyStoredTheme } = await import('./theme')
    applyStoredTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes .dark when storage is light', async () => {
    localStorageMock['erd-theme'] = 'light'
    document.documentElement.classList.add('dark')
    const { applyStoredTheme } = await import('./theme')
    applyStoredTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
