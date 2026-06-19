import { contentKey, formatTitle, percentOf, toScrobbleRequest } from './converter.js'
import { resolveShowMatch } from './show-matcher.js'
import { MyShowsClient } from './myshows-client.js'
import { MYSHOWS_ENDPOINTS, type ScrobbleEndpoint } from './scrobble-dto.js'
import {
  DEFAULT_SETTINGS,
  PROGRESS_ANTISPAM_THRESHOLD,
  type ExtensionSettings,
  type MediaMetadata,
  type NowPlayingEntry,
  type PlaybackUpdate,
} from './types.js'

interface SessionState {
  key: string
  metadata: MediaMetadata
  started: boolean
  lastPercent: number
  lastState: 'playing' | 'paused'
}

export class ScrobbleHandler {
  private client: MyShowsClient
  private settings: ExtensionSettings
  private sessions = new Map<number, SessionState>()
  private nowPlaying = new Map<string, NowPlayingEntry>()
  private lastBroadcastPercent = new Map<string, number>()
  private onUpdate?: () => void

  constructor(settings: ExtensionSettings = DEFAULT_SETTINGS, onUpdate?: () => void) {
    this.settings = settings
    this.client = new MyShowsClient(settings.myshowsToken, settings.myshowsUrl)
    this.onUpdate = onUpdate
  }

  updateSettings(settings: ExtensionSettings): void {
    this.settings = settings
    this.client.setToken(settings.myshowsToken)
    this.client.setBaseUrl(settings.myshowsUrl)
  }

  getNowPlaying(): NowPlayingEntry[] {
    return Array.from(this.nowPlaying.values())
  }

  async checkToken(token: string, url: string): Promise<{ valid: boolean; error?: string }> {
    const checker = new MyShowsClient(token, url)
    return checker.checkToken()
  }

  clearTab(tabId: number): void {
    this.sessions.delete(tabId)
    for (const [key, entry] of this.nowPlaying) {
      if (entry.tabId === tabId) {
        this.nowPlaying.delete(key)
        this.lastBroadcastPercent.delete(key)
      }
    }
    this.onUpdate?.()
  }

  async handlePlayback(update: PlaybackUpdate): Promise<void> {
    if (!this.settings.enabled || !this.settings.myshowsToken) {
      return
    }

    const key = contentKey(update.metadata)
    const percent = percentOf(update.currentTime, update.duration)
    const title = formatTitle(update.metadata)

    let session = this.sessions.get(update.tabId)
    if (!session || session.key !== key) {
      if (session) {
        await this.endSession(update.tabId, session, session.lastPercent)
      }
      session = { key, metadata: update.metadata, started: false, lastPercent: percent, lastState: update.state }
      this.sessions.set(update.tabId, session)
    }

    session.metadata = update.metadata
    session.lastPercent = percent
    session.lastState = update.state

    if (update.action === 'stopped') {
      await this.endSession(update.tabId, session, percent)
      this.sessions.delete(update.tabId)
      return
    }

    const last = this.lastBroadcastPercent.get(key)
    if (
      last !== undefined &&
      Math.abs(percent - last) < PROGRESS_ANTISPAM_THRESHOLD &&
      this.nowPlaying.has(key)
    ) {
      const prev = this.nowPlaying.get(key)
      if (prev && prev.state === update.state) {
        return
      }
    }

    this.lastBroadcastPercent.set(key, percent)
    this.nowPlaying.set(key, {
      tabId: update.tabId,
      metadata: update.metadata,
      percent,
      state: update.state,
      updatedAt: new Date().toISOString(),
    })
    this.onUpdate?.()

    const endpoint: ScrobbleEndpoint = session.started
      ? MYSHOWS_ENDPOINTS.SCROBBLE_PAUSE
      : MYSHOWS_ENDPOINTS.SCROBBLE_START

    if (!session.started) {
      session.started = true
    }

    const match = await resolveShowMatch(update.metadata, this.settings.myshowsToken)
    const payload = toScrobbleRequest(update.metadata, percent, match)
    console.debug(`[MyShows] ${endpoint}: ${title} [${update.state}] ${percent.toFixed(1)}%`)
    await this.client.sendScrobble(endpoint, payload)
  }

  private async endSession(tabId: number, session: SessionState, percent: number): Promise<void> {
    const key = session.key
    const title = formatTitle(session.metadata)

    this.nowPlaying.delete(key)
    this.lastBroadcastPercent.delete(key)
    this.onUpdate?.()

    const threshold = this.settings.scrobblePercent

    if (percent < threshold) {
      console.info(`[MyShows] Пропущено: ${title} (${percent.toFixed(1)}% < ${threshold}%)`)
      return
    }

    console.info(`[MyShows] Отмечено: ${title} (${percent.toFixed(1)}%)`)
    const match = await resolveShowMatch(session.metadata, this.settings.myshowsToken)
    const payload = toScrobbleRequest(session.metadata, percent, match)
    await this.client.sendScrobble(MYSHOWS_ENDPOINTS.SCROBBLE_STOP, payload)
  }
}
