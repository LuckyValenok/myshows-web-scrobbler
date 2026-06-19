import {
  loadMatchOverrides,
  resolveMatchOverride,
  saveMatchOverride,
  type ShowMatchOverride,
} from './match-overrides.js'
import { MyShowsRpcClient, type MyShowsShow } from './myshows-rpc.js'
import type { MediaMetadata } from './types.js'

const resolveCache = new Map<string, Promise<ShowMatchOverride | null>>()

export async function resolveShowMatch(
  metadata: MediaMetadata,
  token: string,
): Promise<ShowMatchOverride | null> {
  const manual = await resolveMatchOverride(metadata)
  if (manual) return manual

  const cacheKey = metadata.siteId
  const pending = resolveCache.get(cacheKey)
  if (pending) return pending

  const task = autoResolve(metadata, token).finally(() => {
    resolveCache.delete(cacheKey)
  })
  resolveCache.set(cacheKey, task)
  return task
}

async function autoResolve(
  metadata: MediaMetadata,
  token: string,
): Promise<ShowMatchOverride | null> {
  const all = await loadMatchOverrides()
  for (const key of overrideKeysFor(metadata)) {
    const existing = all[key]
    if (existing?.myshowId || existing?.title) {
      return existing
    }
  }

  const client = new MyShowsRpcClient(token)
  const sourceLabel = metadata.showTitle ?? metadata.title

  if (metadata.kinopoiskId) {
    const show = await client.getByExternalId('kinopoisk', metadata.kinopoiskId)
    if (show?.id) {
      return persistAutoMatch(metadata, show, sourceLabel)
    }
  }

  if (metadata.imdbId) {
    const show = await client.getByExternalId('imdb', metadata.imdbId)
    if (show?.id) {
      return persistAutoMatch(metadata, show, sourceLabel)
    }
  }

  const queries = buildSearchQueries(metadata)
  for (const query of queries) {
    const results = await client.searchShows(query)
    const picked = pickBestSearchResult(metadata, results)
    if (picked) {
      return persistAutoMatch(metadata, picked, sourceLabel)
    }
  }

  return null
}

function overrideKeysFor(metadata: MediaMetadata): string[] {
  const keys: string[] = [`site:${metadata.siteId}`]
  if (metadata.kinopoiskId) keys.unshift(`kp:${metadata.kinopoiskId}`)
  if (metadata.imdbId) keys.unshift(`imdb:${metadata.imdbId}`)
  return keys
}

function buildSearchQueries(metadata: MediaMetadata): string[] {
  const seen = new Set<string>()
  const queries: string[] = []

  const add = (value?: string) => {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) return
    seen.add(trimmed.toLowerCase())
    queries.push(trimmed)
  }

  add(metadata.originalTitle)
  add(metadata.showTitle)
  for (const alias of metadata.titleAliases ?? []) {
    add(alias)
  }
  add(metadata.title)

  return queries
}

function pickBestSearchResult(
  metadata: MediaMetadata,
  results: MyShowsShow[],
): MyShowsShow | null {
  if (results.length === 0) return null

  const scored = results
    .map((show) => ({ show, score: scoreShow(metadata, show) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const best = scored[0]
  if (best.score >= 80) return best.show
  if (scored.length === 1 && best.score >= 50) return best.show

  const second = scored[1]
  if (second && best.score - second.score >= 25 && best.score >= 60) {
    return best.show
  }

  return null
}

function scoreShow(metadata: MediaMetadata, show: MyShowsShow): number {
  let score = 0

  if (metadata.kinopoiskId && show.kinopoiskId === metadata.kinopoiskId) {
    score += 100
  }
  if (metadata.imdbId && show.imdbId === metadata.imdbId) {
    score += 100
  }
  if (metadata.year && show.year === metadata.year) {
    score += 15
  }

  const candidates = [
    metadata.showTitle,
    metadata.originalTitle,
    ...(metadata.titleAliases ?? []),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    score = Math.max(score, titleSimilarity(candidate, show.title))
    score = Math.max(score, titleSimilarity(candidate, show.titleOriginal))
  }

  return score
}

function titleSimilarity(a?: string, b?: string): number {
  if (!a || !b) return 0
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return 0
  if (left === right) return 90
  if (left.includes(right) || right.includes(left)) return 70

  const leftWords = left.split(' ')
  const rightWords = new Set(right.split(' '))
  const overlap = leftWords.filter((word) => word.length > 2 && rightWords.has(word)).length
  if (overlap >= 2) return 55 + overlap * 5
  if (overlap === 1) return 40

  return 0
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function persistAutoMatch(
  metadata: MediaMetadata,
  show: MyShowsShow,
  sourceLabel: string,
): Promise<ShowMatchOverride> {
  const override: ShowMatchOverride = {
    title: show.title ?? show.titleOriginal,
    myshowId: show.id,
    sourceLabel,
    matchSource: 'auto',
    updatedAt: new Date().toISOString(),
  }
  await saveMatchOverride(metadata, override)
  return override
}

export async function searchMyShowsShows(
  token: string,
  query: string,
): Promise<MyShowsShow[]> {
  const client = new MyShowsRpcClient(token)
  return client.searchShows(query, 12)
}
