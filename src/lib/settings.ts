import { DEFAULT_SETTINGS, type ExtensionSettings } from './types.js'

const STORAGE_KEY = 'settings'

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] ?? {}) }
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings()
  const next = { ...current, ...partial }
  await chrome.storage.sync.set({ [STORAGE_KEY]: next })
  return next
}
