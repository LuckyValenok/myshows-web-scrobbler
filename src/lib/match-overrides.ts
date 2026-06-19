import type { MediaMetadata } from './types.js'

export interface ShowMatchOverride {
  /** Название сериала как на MyShows */
  title?: string
  /** ID сериала на MyShows */
  myshowId?: number
  /** Название на сайте-источнике (Rezka и т.п.) */
  sourceLabel?: string
  matchSource?: 'auto' | 'manual'
  updatedAt?: string
}

export interface MatchOverrideEntry {
  key: string
  override: ShowMatchOverride
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

export async function listMatchOverrides(): Promise<MatchOverrideEntry[]> {
  const all = await loadMatchOverrides()
  return Object.entries(all)
    .map(([key, override]) => ({ key, override }))
    .sort((a, b) => (b.override.updatedAt ?? '').localeCompare(a.override.updatedAt ?? ''))
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
  const prev = all[primaryKey]

  all[primaryKey] = {
    title: override.title?.trim() || undefined,
    myshowId: override.myshowId,
    sourceLabel: override.sourceLabel ?? prev?.sourceLabel ?? metadata.showTitle ?? metadata.title,
    matchSource: override.matchSource ?? 'manual',
    updatedAt: new Date().toISOString(),
  }

  await chrome.storage.sync.set({ [STORAGE_KEY]: all })
}

export async function saveMatchOverrideByKey(
  key: string,
  override: ShowMatchOverride,
): Promise<void> {
  const all = await loadMatchOverrides()
  const prev = all[key]

  all[key] = {
    title: override.title?.trim() || undefined,
    myshowId: override.myshowId,
    sourceLabel: override.sourceLabel ?? prev?.sourceLabel,
    matchSource: override.matchSource ?? 'manual',
    updatedAt: new Date().toISOString(),
  }

  await chrome.storage.sync.set({ [STORAGE_KEY]: all })
}

export async function deleteMatchOverride(key: string): Promise<void> {
  const all = await loadMatchOverrides()
  delete all[key]
  await chrome.storage.sync.set({ [STORAGE_KEY]: all })
}

export function formatOverrideKey(key: string): string {
  if (key.startsWith('kp:')) return `Кинопоиск ${key.slice(3)}`
  if (key.startsWith('imdb:')) return `IMDb ${key.slice(5)}`
  if (key.startsWith('myshow:')) return `MyShows ID ${key.slice(7)}`
  if (key.startsWith('site:')) return key.slice(5)
  return key
}
