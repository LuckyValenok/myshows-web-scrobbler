import pkg from '../../package.json'

export const DEFAULT_MYSHOWS_URL = 'https://myshows.me/scrobble'
export const DEFAULT_SCROBBLE_PERCENT = 80
export const APP_VERSION = pkg.version
export const PROGRESS_ANTISPAM_THRESHOLD = 1

export interface ExtensionSettings {
  myshowsToken: string
  myshowsUrl: string
  scrobblePercent: number
  enabled: boolean
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  myshowsToken: '',
  myshowsUrl: DEFAULT_MYSHOWS_URL,
  scrobblePercent: DEFAULT_SCROBBLE_PERCENT,
  enabled: true,
}

export type PlaybackAction = 'progress' | 'stopped'
export type PlaybackState = 'playing' | 'paused'

export interface MediaMetadata {
  type: 'movie' | 'episode'
  title: string
  /** Основное название (без альтернатив через «/») */
  showTitle?: string
  /** Оригинальное название (на Rezka — `.b-post__origtitle`) */
  originalTitle?: string
  /** Другие русские названия из заголовка Rezka (через «/») */
  titleAliases?: string[]
  season?: number
  episode?: number
  year?: number
  kinopoiskId?: number
  imdbId?: string
  siteId: string
  siteName: string
}

export interface PlaybackUpdate {
  tabId: number
  frameId: number
  metadata: MediaMetadata
  currentTime: number
  duration: number
  state: PlaybackState
  action: PlaybackAction
}

export interface NowPlayingEntry {
  tabId: number
  metadata: MediaMetadata
  percent: number
  state: PlaybackState
  updatedAt: string
}

export type Message =
  | { type: 'PLAYBACK_UPDATE'; payload: PlaybackUpdate }
  | { type: 'METADATA_UPDATE'; payload: { tabId: number; metadata: MediaMetadata } }
  | { type: 'REGISTER_PLAYER_FRAME' }
  | { type: 'REQUEST_METADATA' }
  | { type: 'GET_STATUS' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; payload: Partial<ExtensionSettings> }
  | { type: 'CHECK_TOKEN'; payload: { token: string; url: string } }
  | { type: 'SAVE_MATCH_OVERRIDE'; payload: { metadata: MediaMetadata; override: ShowMatchOverrideInput } }
  | { type: 'GET_MATCH_OVERRIDE'; payload: { metadata: MediaMetadata } }
  | { type: 'RESOLVE_SHOW_MATCH'; payload: { metadata: MediaMetadata } }
  | { type: 'LIST_MATCH_OVERRIDES' }
  | { type: 'DELETE_MATCH_OVERRIDE'; payload: { key: string } }
  | { type: 'SAVE_MATCH_BY_KEY'; payload: { key: string; override: ShowMatchOverrideInput } }
  | { type: 'SEARCH_MYSHOWS_SHOWS'; payload: { query: string } }
  | { type: 'GET_UPDATE_STATUS'; payload?: { force?: boolean } }
  | { type: 'DISMISS_UPDATE'; payload: { version: string } }

export interface ShowMatchOverrideInput {
  title?: string
  myshowId?: number
  sourceLabel?: string
}

export interface MatchOverrideListItem {
  key: string
  override: {
    title?: string
    myshowId?: number
    sourceLabel?: string
    matchSource?: 'auto' | 'manual'
    updatedAt?: string
  }
}

export interface MyShowsShowResult {
  id?: number
  title?: string
  titleOriginal?: string
  year?: number
  kinopoiskId?: number
  imdbId?: string
}

import type { UpdateStatus } from './update-check.js'

export type MessageResponse =
  | {
      ok: true
      nowPlaying?: NowPlayingEntry[]
      settings?: ExtensionSettings
      metadata?: MediaMetadata
      valid?: boolean
      error?: string
      override?: ShowMatchOverrideInput & { matchSource?: 'auto' | 'manual'; updatedAt?: string }
      matches?: MatchOverrideListItem[]
      searchResults?: MyShowsShowResult[]
      updateStatus?: UpdateStatus
    }
  | { ok: false; error: string }
