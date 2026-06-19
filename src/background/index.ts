import { ScrobbleHandler } from '../lib/scrobble-handler.js'
import {
  deleteMatchOverride,
  listMatchOverrides,
  resolveMatchOverride,
  saveMatchOverride,
  saveMatchOverrideByKey,
} from '../lib/match-overrides.js'
import { loadSettings, saveSettings } from '../lib/settings.js'
import { resolveShowMatch, searchMyShowsShows } from '../lib/show-matcher.js'
import { dismissUpdate, getUpdateStatus } from '../lib/update-check.js'
import type {
  ExtensionSettings,
  MatchOverrideListItem,
  MediaMetadata,
  Message,
  MessageResponse,
  PlaybackUpdate,
  ShowMatchOverrideInput,
} from '../lib/types.js'

const handler = new ScrobbleHandler(undefined, updateBadge)

const UPDATE_ALARM = 'checkUpdate'
let updateAvailable = false

const tabMetadata = new Map<number, MediaMetadata>()
const tabPlayerFrame = new Map<number, number>()

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings()
  handler.updateSettings(settings)
  chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 720 })
  await refreshUpdateState()
})

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && changes.settings) {
    handler.updateSettings(changes.settings.newValue as ExtensionSettings)
  }
})

loadSettings().then((settings) => handler.updateSettings(settings))
refreshUpdateState()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    refreshUpdateState(true)
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  handler.clearTab(tabId)
  tabMetadata.delete(tabId)
  tabPlayerFrame.delete(tabId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message as Message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }))
  return true
})

async function handleMessage(
  message: Message | { type: string; payload?: unknown },
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender.tab?.id
  const settings = await loadSettings()

  switch (message.type) {
    case 'METADATA_UPDATE': {
      if (tabId == null) return { ok: false, error: 'No tab' }
      const payload = (message as { payload: { metadata: MediaMetadata } }).payload
      tabMetadata.set(tabId, payload.metadata)
      return { ok: true }
    }

    case 'REGISTER_PLAYER_FRAME': {
      if (tabId == null || sender.frameId == null) return { ok: false, error: 'No tab' }
      tabPlayerFrame.set(tabId, sender.frameId)
      return { ok: true }
    }

    case 'REQUEST_METADATA': {
      if (tabId == null) return { ok: false, error: 'No tab' }
      return { ok: true, metadata: tabMetadata.get(tabId) }
    }

    case 'PLAYBACK_UPDATE': {
      if (tabId == null) return { ok: false, error: 'No tab' }

      const playerFrame = tabPlayerFrame.get(tabId)
      if (playerFrame != null && sender.frameId != null && sender.frameId !== playerFrame) {
        return { ok: true }
      }

      const payload = (message as { payload: PlaybackUpdate }).payload
      const metadata = payload.metadata ?? tabMetadata.get(tabId)
      if (!metadata) return { ok: true }

      const update: PlaybackUpdate = {
        ...payload,
        tabId,
        frameId: sender.frameId ?? 0,
        metadata,
      }

      await handler.handlePlayback(update)
      return { ok: true }
    }

    case 'GET_STATUS':
      return { ok: true, nowPlaying: handler.getNowPlaying() }

    case 'GET_SETTINGS':
      return { ok: true, settings }

    case 'SAVE_SETTINGS': {
      const partial = (message as { payload: Partial<ExtensionSettings> }).payload
      const next = await saveSettings(partial)
      handler.updateSettings(next)
      return { ok: true, settings: next }
    }

    case 'CHECK_TOKEN': {
      const { token, url } = (message as { payload: { token: string; url: string } }).payload
      const result = await handler.checkToken(token, url)
      return { ok: true, valid: result.valid, error: result.error }
    }

    case 'GET_MATCH_OVERRIDE': {
      const { metadata } = (message as { payload: { metadata: MediaMetadata } }).payload
      const override = await resolveMatchOverride(metadata)
      return { ok: true, override: override ?? undefined }
    }

    case 'RESOLVE_SHOW_MATCH': {
      const { metadata } = (message as { payload: { metadata: MediaMetadata } }).payload
      if (!settings.myshowsToken) {
        return { ok: false, error: 'Токен не настроен' }
      }
      const override = await resolveShowMatch(metadata, settings.myshowsToken)
      return { ok: true, override: override ?? undefined }
    }

    case 'SAVE_MATCH_OVERRIDE': {
      const { metadata, override } = (
        message as { payload: { metadata: MediaMetadata; override: ShowMatchOverrideInput } }
      ).payload
      await saveMatchOverride(metadata, {
        ...override,
        matchSource: 'manual',
        sourceLabel: override.sourceLabel ?? metadata.showTitle ?? metadata.title,
      })
      return { ok: true }
    }

    case 'LIST_MATCH_OVERRIDES': {
      const matches = await listMatchOverrides()
      return { ok: true, matches: matches as MatchOverrideListItem[] }
    }

    case 'DELETE_MATCH_OVERRIDE': {
      const { key } = (message as { payload: { key: string } }).payload
      await deleteMatchOverride(key)
      return { ok: true }
    }

    case 'SAVE_MATCH_BY_KEY': {
      const { key, override } = (
        message as { payload: { key: string; override: ShowMatchOverrideInput } }
      ).payload
      await saveMatchOverrideByKey(key, { ...override, matchSource: 'manual' })
      return { ok: true }
    }

    case 'SEARCH_MYSHOWS_SHOWS': {
      const { query } = (message as { payload: { query: string } }).payload
      if (!settings.myshowsToken) {
        return { ok: false, error: 'Токен не настроен' }
      }
      const searchResults = await searchMyShowsShows(settings.myshowsToken, query)
      return { ok: true, searchResults }
    }

    case 'GET_UPDATE_STATUS': {
      const force = (message as { payload?: { force?: boolean } }).payload?.force
      const updateStatus = await getUpdateStatus(force)
      updateAvailable = updateStatus.updateAvailable
      updateBadge()
      return { ok: true, updateStatus }
    }

    case 'DISMISS_UPDATE': {
      const { version } = (message as { payload: { version: string } }).payload
      await dismissUpdate(version)
      updateAvailable = false
      updateBadge()
      return { ok: true }
    }

    default:
      return { ok: false, error: `Unknown message: ${message.type}` }
  }
}

function updateBadge(): void {
  if (updateAvailable) {
    chrome.action.setBadgeText({ text: '↑' })
    chrome.action.setBadgeBackgroundColor({ color: '#ff9800' })
    return
  }

  const count = handler.getNowPlaying().length
  const text = count > 0 ? String(count) : ''
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: '#cc0000' })
}

async function refreshUpdateState(force = false): Promise<void> {
  const status = await getUpdateStatus(force)
  updateAvailable = status.updateAvailable
  updateBadge()
}
