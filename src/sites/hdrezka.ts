import type { MediaMetadata } from '../lib/types.js'

export interface SiteAdapter {
  readonly name: string
  matches(hostname: string): boolean
  extractMetadata(doc: Document, url: string): MediaMetadata | null
}

function parseIntSafe(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

function findIdInText(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern)
  return match?.[1]
}

/** Rezka hides external URLs behind /help/{base64(url-encoded-url)}/ */
function decodeHelpLink(href: string): string | null {
  const match = href.match(/\/help\/([^/?#]+)/)
  if (!match) return null

  try {
    const decoded = atob(match[1])
    return decoded.includes('%') ? decodeURIComponent(decoded) : decoded
  } catch {
    return null
  }
}

function extractIdFromRatesBlock(doc: Document, selector: string, pattern: RegExp): string | undefined {
  const link = doc.querySelector<HTMLAnchorElement>(`${selector} a[href*="/help/"]`)
  if (!link) return undefined

  const target = decodeHelpLink(link.getAttribute('href') ?? link.href)
  if (!target) return undefined

  return findIdInText(target, pattern)
}

function extractIdFromHelpLinks(
  doc: Document,
  pattern: RegExp,
  map: (id: string) => number | string | undefined,
): number | string | undefined {
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('.b-post__info_rates a[href*="/help/"], a[href*="/help/"]')) {
    const target = decodeHelpLink(link.getAttribute('href') ?? link.href)
    if (!target) continue
    const id = findIdInText(target, pattern)
    if (id) {
      const mapped = map(id)
      if (mapped != null) return mapped
    }
  }
  return undefined
}

function extractKinopoiskId(doc: Document): number | undefined {
  const fromRates = extractIdFromRatesBlock(doc, '.b-post__info_rates.kp', /\/(?:film|series)\/(\d+)/)
  if (fromRates) return parseInt(fromRates, 10)

  const fromHelp = extractIdFromHelpLinks(doc, /\/(?:film|series)\/(\d+)/, (id) => parseInt(id, 10))
  if (typeof fromHelp === 'number') return fromHelp

  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href*="kinopoisk"]')) {
    const id = findIdInText(link.href, /\/(?:film|series)\/(\d+)/)
    if (id) return parseInt(id, 10)
  }

  for (const el of doc.querySelectorAll('[data-kp-id], [data-kinopoisk-id]')) {
    const id = parseIntSafe(el.getAttribute('data-kp-id') ?? el.getAttribute('data-kinopoisk-id'))
    if (id) return id
  }

  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent ?? '')
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        const sameAs = item?.sameAs
        const urls = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : []
        for (const href of urls) {
          if (typeof href === 'string' && href.includes('kinopoisk')) {
            const id = findIdInText(href, /\/(?:film|series)\/(\d+)/)
            if (id) return parseInt(id, 10)
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }

  const itemprop = doc.querySelector<HTMLMetaElement>('meta[itemprop="sameAs"][content*="kinopoisk"]')
  if (itemprop?.content) {
    const id = findIdInText(itemprop.content, /\/(?:film|series)\/(\d+)/)
    if (id) return parseInt(id, 10)
  }

  return undefined
}

function extractImdbId(doc: Document): string | undefined {
  const fromRates = extractIdFromRatesBlock(doc, '.b-post__info_rates.imdb', /(tt\d+)/)
  if (fromRates) return fromRates

  const fromHelp = extractIdFromHelpLinks(doc, /(tt\d+)/, (id) => id)
  if (typeof fromHelp === 'string') return fromHelp

  for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href*="imdb.com/title/tt"]')) {
    const id = findIdInText(link.href, /(tt\d+)/)
    if (id) return id
  }

  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent ?? '')
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        const sameAs = item?.sameAs
        const urls = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : []
        for (const href of urls) {
          if (typeof href === 'string' && href.includes('imdb.com/title/tt')) {
            const id = findIdInText(href, /(tt\d+)/)
            if (id) return id
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }

  return undefined
}

function extractYear(doc: Document, url: string): number | undefined {
  const metaEl = doc.querySelector('.b-post__info .b-post__info_meta .b-post__info_meta_item')
  const fromMeta = metaEl?.textContent?.match(/\b(19|20)\d{2}\b/)
  if (fromMeta) return parseInt(fromMeta[0], 10)

  const ogTitle = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? ''
  const fromOg = ogTitle.match(/\((19|20)\d{2}\)/)
  if (fromOg) return parseInt(fromOg[1], 10)

  const fromPath = url.match(/-(19|20)\d{2}(?:\.html|[#?]|$)/)
  if (fromPath) return parseInt(fromPath[1], 10)

  return undefined
}

function extractOriginalTitle(doc: Document): string | undefined {
  const el = doc.querySelector('.b-post__origtitle')
  const text = el?.textContent?.replace(/\s+/g, ' ').trim()
  return text || undefined
}

function extractShowTitle(doc: Document): { primary: string; aliases: string[] } {
  let raw = ''

  const h1 = doc.querySelector<HTMLHeadingElement>('.b-post__title h1, h1[itemprop="name"]')
  if (h1?.textContent) {
    raw = h1.textContent.replace(/\s+/g, ' ').trim()
  } else {
    const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')
    if (og?.content) {
      raw = og.content
        .replace(/\s*\((19|20)\d{2}\)\s*$/, '')
        .replace(/\s*смотреть.*$/i, '')
        .trim()
    } else {
      raw = doc.title.replace(/\s*—.*$/, '').trim()
    }
  }

  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean)
  return {
    primary: parts[0] ?? raw,
    aliases: parts.slice(1),
  }
}

function extractSiteId(url: string): string {
  try {
    const { pathname } = new URL(url)
    return pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

function extractSeasonEpisode(
  url: string,
  doc: Document,
): { season?: number; episode?: number } {
  const fromUrl = url.match(/-s:(\d+)-e:(\d+)/)
  if (fromUrl) {
    return { season: parseIntSafe(fromUrl[1]), episode: parseIntSafe(fromUrl[2]) }
  }

  const activeEpisode = doc.querySelector('.b-simple_episode__item.active, .b-simple_episode__item.selected')
  if (activeEpisode) {
    return {
      season: parseIntSafe(activeEpisode.getAttribute('data-season_id')),
      episode: parseIntSafe(activeEpisode.getAttribute('data-episode_id')),
    }
  }

  return {}
}

function extractEpisodeTitle(doc: Document, episode?: number): string {
  const activeEpisode = doc.querySelector('.b-simple_episode__item.active, .b-simple_episode__item.selected')
  if (activeEpisode?.textContent) {
    return activeEpisode.textContent.replace(/\s+/g, ' ').trim()
  }

  const titled = doc.querySelector('.b-simple_episode__item.active .b-simple_episode__title')
  if (titled?.textContent) {
    return titled.textContent.trim()
  }

  return episode != null ? `Серия ${episode}` : 'Серия'
}

export const hdrezkaAdapter: SiteAdapter = {
  name: 'hdrezka',
  matches(hostname: string) {
    return hostname.includes('rezka')
  },

  extractMetadata(doc: Document, url: string): MediaMetadata | null {
    const { season, episode } = extractSeasonEpisode(url, doc)

    const parsedTitle = extractShowTitle(doc)
    if (!parsedTitle.primary) return null

    const originalTitle = extractOriginalTitle(doc)
    const kinopoiskId = extractKinopoiskId(doc)
    const imdbId = extractImdbId(doc)
    const year = extractYear(doc, url)
    const siteId = extractSiteId(url)

    if (season != null && episode != null) {
      return {
        type: 'episode',
        title: extractEpisodeTitle(doc, episode),
        showTitle: parsedTitle.primary,
        originalTitle,
        titleAliases: parsedTitle.aliases.length > 0 ? parsedTitle.aliases : undefined,
        season,
        episode,
        year,
        kinopoiskId,
        imdbId,
        siteId,
        siteName: 'hdrezka',
      }
    }

    const isSeriesPage = doc.querySelector('.b-simple_season__item, .b-simple_episode__item')
    if (isSeriesPage && season == null) {
      return null
    }

    return {
      type: 'movie',
      title: parsedTitle.primary,
      showTitle: parsedTitle.primary,
      originalTitle,
      titleAliases: parsedTitle.aliases.length > 0 ? parsedTitle.aliases : undefined,
      year,
      kinopoiskId,
      imdbId,
      siteId,
      siteName: 'hdrezka',
    }
  },
}

export const siteAdapters: SiteAdapter[] = [hdrezkaAdapter]

export function findAdapter(hostname: string): SiteAdapter | null {
  return siteAdapters.find((a) => a.matches(hostname)) ?? null
}
