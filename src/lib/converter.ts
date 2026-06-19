import type { ShowMatchOverride } from './match-overrides.js'
import type { MediaMetadata } from './types.js'
import { APP_VERSION } from './types.js'
import type {
  ScrobbleEpisodeRequest,
  ScrobbleMovieRequest,
  ScrobbleRequest,
} from './scrobble-dto.js'

export function toScrobbleRequest(
  metadata: MediaMetadata,
  progress: number,
  matchOverride?: ShowMatchOverride | null,
): ScrobbleRequest {
  const base = {
    progress,
    source_app: metadata.siteName,
    app_version: APP_VERSION,
  }

  const ids = {
    ...(matchOverride?.myshowId ? { myshow: matchOverride.myshowId } : {}),
    ...(metadata.imdbId ? { imdb: metadata.imdbId } : {}),
    ...(metadata.kinopoiskId ? { kinopoisk: metadata.kinopoiskId } : {}),
  }

  const displayTitle = matchOverride?.title ?? metadata.showTitle ?? metadata.title
  const originalTitle =
    metadata.originalTitle && metadata.originalTitle !== displayTitle
      ? metadata.originalTitle
      : undefined

  if (metadata.type === 'movie') {
    return {
      ...base,
      movie: {
        title: displayTitle,
        ...(originalTitle ? { original_title: originalTitle } : {}),
        ...(metadata.year ? { year: metadata.year } : {}),
        ids,
      },
    } satisfies ScrobbleMovieRequest
  }

  return {
    ...base,
    show: {
      title: displayTitle,
      ...(originalTitle ? { original_title: originalTitle } : {}),
      ...(metadata.year ? { year: metadata.year } : {}),
      ids,
    },
    episode: {
      ...(metadata.season != null ? { season: metadata.season } : {}),
      ...(metadata.episode != null ? { number: metadata.episode } : {}),
      title: metadata.title,
    },
  } satisfies ScrobbleEpisodeRequest
}

export function contentKey(metadata: MediaMetadata): string {
  if (metadata.type === 'episode') {
    return `${metadata.siteId}:s${metadata.season ?? 0}:e${metadata.episode ?? 0}`
  }
  return `${metadata.siteId}:movie`
}

export function formatTitle(metadata: MediaMetadata): string {
  if (metadata.type === 'episode') {
    const show = metadata.showTitle ?? metadata.title
    return `${show} S${metadata.season ?? '?'}E${metadata.episode ?? '?'}`
  }
  return metadata.showTitle ?? metadata.title
}

export function percentOf(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0
  return Math.min(100, (currentTime / duration) * 100)
}
