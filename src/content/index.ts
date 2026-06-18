import type { MediaMetadata, PlaybackUpdate } from '../lib/types.js'
import { extractPageMetadata, isSupportedSite } from '../sites/index.js'
import { findPrimaryVideo, VideoMonitor } from './player-monitor.js'
import { isContextAlive, onExtensionShutdown, sendMessage } from './runtime.js'

let monitor: VideoMonitor | null = null
let currentMetadata: MediaMetadata | null = null
let isPlayerFrame = false
let monitoredVideo: HTMLVideoElement | null = null
const observers: MutationObserver[] = []

function shutdown(): void {
  for (const observer of observers) {
    observer.disconnect()
  }
  observers.length = 0

  if (monitor) {
    monitor.destroy()
    monitor = null
  }

  monitoredVideo = null
}

onExtensionShutdown(shutdown)

function observeMutations(callback: () => void): void {
  const observer = new MutationObserver(() => {
    if (!isContextAlive()) {
      shutdown()
      return
    }
    callback()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  observers.push(observer)
}

function sendPlayback(update: Omit<PlaybackUpdate, 'tabId' | 'frameId' | 'metadata'>): void {
  if (!currentMetadata) return

  sendMessage({
    type: 'PLAYBACK_UPDATE',
    payload: {
      tabId: -1,
      frameId: -1,
      metadata: currentMetadata,
      ...update,
    },
  } satisfies { type: 'PLAYBACK_UPDATE'; payload: PlaybackUpdate })
}

function refreshMetadata(): MediaMetadata | null {
  const metadata = extractPageMetadata()
  if (metadata) {
    currentMetadata = metadata
    sendMessage({
      type: 'METADATA_UPDATE',
      payload: { tabId: -1, metadata },
    })
  }
  return metadata
}

function startMonitoring(video: HTMLVideoElement): void {
  if (!isContextAlive()) return
  if (monitor && monitoredVideo === video) return

  if (monitor) {
    monitor.destroy()
    monitor = null
  }

  monitoredVideo = video

  if (!currentMetadata) {
    currentMetadata = refreshMetadata()
  }
  if (!currentMetadata) return

  monitor = new VideoMonitor(video, currentMetadata, (data) => {
    if (!isContextAlive()) {
      shutdown()
      return
    }
    sendPlayback(data)
  })

  isPlayerFrame = true
  sendMessage({ type: 'REGISTER_PLAYER_FRAME' })
}

function observeVideo(): void {
  const tryAttach = (): void => {
    if (!isContextAlive()) {
      shutdown()
      return
    }
    const video = findPrimaryVideo()
    if (video) {
      startMonitoring(video)
    }
  }

  tryAttach()
  observeMutations(tryAttach)

  window.addEventListener('hashchange', () => {
    if (!isContextAlive()) {
      shutdown()
      return
    }
    currentMetadata = refreshMetadata()
    if (monitor && currentMetadata) {
      monitor.updateMetadata(currentMetadata)
    }
  })
}

function initTopFrame(): void {
  if (!isSupportedSite()) return

  currentMetadata = refreshMetadata()
  if (!currentMetadata) return

  observeVideo()

  const titleObserver = new MutationObserver(() => {
    if (!isContextAlive()) {
      shutdown()
      return
    }
    const next = refreshMetadata()
    if (next && monitor) {
      monitor.updateMetadata(next)
    }
  })

  const titleEl = document.querySelector('.b-post__title, .b-post__origtitle, h1')
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true })
    observers.push(titleObserver)
  }
}

function initChildFrame(): void {
  const tryAttach = (): void => {
    if (!isContextAlive()) {
      shutdown()
      return
    }

    const video = findPrimaryVideo()
    if (!video || (monitor && monitoredVideo === video)) return

    sendMessage<{ metadata?: MediaMetadata }>({ type: 'REQUEST_METADATA' }, (response) => {
      if (!isContextAlive()) {
        shutdown()
        return
      }
      if (!response?.metadata) {
        window.setTimeout(tryAttach, 1000)
        return
      }
      currentMetadata = response.metadata
      startMonitoring(video)
    })
  }

  tryAttach()
  observeMutations(tryAttach)
}

if (window === window.top) {
  initTopFrame()
} else {
  initChildFrame()
}

window.addEventListener('beforeunload', () => {
  if (monitor && isPlayerFrame) {
    const video = monitor.getVideo()
    sendPlayback({
      currentTime: video.currentTime,
      duration: video.duration,
      state: 'paused',
      action: 'stopped',
    })
    shutdown()
  }
})
