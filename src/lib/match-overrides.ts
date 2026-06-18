import type { MediaMetadata } from './types.js'

export interface ShowMatchOverride {
  /** Название сериала как на MyShows (например «Таинственный лес») */
  title?: string
  /** ID сериала на MyShows — из URL страницы сериала */
  myshowId?: number
}

const STORAGE_KEY = 'matchOverrides'

export function overrideKeys(metadata: MediaMetadata): string[] {
  const keys: string[] = [`site:${metadata.siteId}`]
  if (metadata.kinopoiskId) keys.unshift(`kp:${metadata.kinopoiskId}`)
  if (metadata.imdbId) keys.unshift(`imdb:${metadata.imdbId}`)
  return keys
}

export async function loadMatchOverrides(): Promise<Record<string, ShowMatchOverride>> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as Record<string, ShowMatchOverride>) ?? {}
}

export async function resolveMatchOverride(
  metadata: MediaMetadata,
): Promise<ShowMatchOverride | null> {
  const all = await loadMatchOverrides()
  for (const key of overrideKeys(metadata)) {
    const override = all[key]
    if (override && (override.title || override.myshowId)) {
      return override
    }
  }
  return null
}

export async function saveMatchOverride(
  metadata: MediaMetadata,
  override: ShowMatchOverride,
): Promise<void> {
  const all = await loadMatchOverrides()
  const primaryKey = overrideKeys(metadata)[0]
  all[primaryKey] = {
    title: override.title?.trim() || undefined,
    myshowId: override.myshowId,
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: all })
}
