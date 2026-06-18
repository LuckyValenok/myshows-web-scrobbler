export interface ScrobbleIds {
  myshow?: number
  trakt?: number
  simkl?: number
  imdb?: string
  tmdb?: string
  tvdb?: string
  slug?: string
  kinopoisk?: number
}

export interface ScrobbleMovieIds extends ScrobbleIds {}

export interface ScrobbleShowIds extends ScrobbleIds {}

export interface ScrobbleEpisodeIds extends ScrobbleIds {}

export interface ScrobbleMovie {
  title?: string
  original_title?: string
  year?: number
  ids: ScrobbleMovieIds
}

export interface ScrobbleShow {
  title?: string
  original_title?: string
  year?: number
  ids: ScrobbleShowIds
}

export interface ScrobbleEpisode {
  season?: number
  number?: number
  title?: string
  ids?: ScrobbleEpisodeIds
}

interface ScrobbleRequestBase {
  progress: number
  app_version?: string
  source_app?: string
}

export interface ScrobbleMovieRequest extends ScrobbleRequestBase {
  movie: ScrobbleMovie
}

export interface ScrobbleEpisodeRequest extends ScrobbleRequestBase {
  show: ScrobbleShow
  episode: ScrobbleEpisode
}

export type ScrobbleRequest = ScrobbleMovieRequest | ScrobbleEpisodeRequest

export type ScrobbleAction = 'start' | 'pause' | 'scrobble' | 'checkin'

export interface ScrobbleResponse {
  id: number
  action: ScrobbleAction
  progress: number
  watched_at?: string
}

export const MYSHOWS_ENDPOINTS = {
  SCROBBLE_START: '/start',
  SCROBBLE_PAUSE: '/pause',
  SCROBBLE_STOP: '/stop',
  CHECK: '/check',
} as const

export type ScrobbleEndpoint =
  | typeof MYSHOWS_ENDPOINTS.SCROBBLE_START
  | typeof MYSHOWS_ENDPOINTS.SCROBBLE_PAUSE
  | typeof MYSHOWS_ENDPOINTS.SCROBBLE_STOP
