import { ScrobbleHandler } from '../lib/scrobble-handler.js'
import { resolveMatchOverride, saveMatchOverride } from '../lib/match-overrides.js'
import { loadSettings, saveSettings } from '../lib/settings.js'
import type {
  ExtensionSettings,
  MediaMetadata,
  Message,
  MessageResponse,
  PlaybackUpdate,
} from '../lib/types.js'

const handler = new ScrobbleHandler(undefined, updateBadge)

const tabMetadata = new Map<number, MediaMetadata>()
const tabPlayerFrame = new Map<number, number>()

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings()
  handler.updateSettings(settings)
})

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && changes.settings) {
    handler.updateSettings(changes.settings.newValue as ExtensionSettings)
  }
})

loadSettings().then((settings) => handler.updateSettings(settings))

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
      return { ok: true, settings: await loadSettings() }

    case 'SAVE_SETTINGS': {
      const partial = (message as { payload: Partial<ExtensionSettings> }).payload
      const settings = await saveSettings(partial)
      handler.updateSettings(settings)
      return { ok: true, settings }
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

    case 'SAVE_MATCH_OVERRIDE': {
      const { metadata, override } = (
        message as { payload: { metadata: MediaMetadata; override: { title?: string; myshowId?: number } } }
      ).payload
      await saveMatchOverride(metadata, override)
      return { ok: true }
    }

    default:
      return { ok: false, error: `Unknown message: ${message.type}` }
  }
}

function updateBadge(): void {
  const count = handler.getNowPlaying().length
  const text = count > 0 ? String(count) : ''
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: '#cc0000' })
}
