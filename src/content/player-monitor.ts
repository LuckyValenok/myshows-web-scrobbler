import type { MediaMetadata, PlaybackState } from '../lib/types.js'

const POLL_INTERVAL_MS = 5000
const MIN_DURATION_SEC = 60

export class VideoMonitor {
  private video: HTMLVideoElement
  private metadata: MediaMetadata
  private pollTimer: number | null = null
  private lastSentPercent = -1
  private destroyed = false
  private onUpdate: (data: {
    currentTime: number
    duration: number
    state: PlaybackState
    action: 'progress' | 'stopped'
  }) => void

  constructor(
    video: HTMLVideoElement,
    metadata: MediaMetadata,
    onUpdate: VideoMonitor['onUpdate'],
  ) {
    this.video = video
    this.metadata = metadata
    this.onUpdate = onUpdate
    this.attach()
  }

  updateMetadata(metadata: MediaMetadata): void {
    this.metadata = metadata
  }

  getMetadata(): MediaMetadata {
    return this.metadata
  }

  getVideo(): HTMLVideoElement {
    return this.video
  }

  destroy(): void {
    this.destroyed = true
    if (this.pollTimer != null) {
      clearInterval(this.pollTimer)
    }
    this.video.removeEventListener('play', this.onPlay)
    this.video.removeEventListener('pause', this.onPause)
    this.video.removeEventListener('ended', this.onEnded)
    this.video.removeEventListener('timeupdate', this.onTimeUpdate)
  }

  private attach(): void {
    this.video.addEventListener('play', this.onPlay)
    this.video.addEventListener('pause', this.onPause)
    this.video.addEventListener('ended', this.onEnded)
    this.video.addEventListener('timeupdate', this.onTimeUpdate)

    this.pollTimer = window.setInterval(() => this.tick(), POLL_INTERVAL_MS)

    if (!this.video.paused && !this.video.ended) {
      this.sendProgress()
    }
  }

  private onPlay = (): void => {
    this.sendProgress()
  }

  private onPause = (): void => {
    this.sendProgress()
  }

  private onEnded = (): void => {
    this.sendStopped()
  }

  private onTimeUpdate = (): void => {
    const duration = this.video.duration
    if (!duration || duration < MIN_DURATION_SEC) return

    const percent = (this.video.currentTime / duration) * 100
    if (Math.abs(percent - this.lastSentPercent) >= 1) {
      this.sendProgress()
    }
  }

  private tick(): void {
    if (this.destroyed) return
    if (!this.video.paused && !this.video.ended) {
      this.sendProgress()
    }
  }

  private sendProgress(): void {
    const duration = this.video.duration
    if (!duration || duration < MIN_DURATION_SEC) return

    const percent = (this.video.currentTime / duration) * 100
    this.lastSentPercent = percent

    this.onUpdate({
      currentTime: this.video.currentTime,
      duration,
      state: this.video.paused ? 'paused' : 'playing',
      action: 'progress',
    })
  }

  private sendStopped(): void {
    const duration = this.video.duration || 0
    this.onUpdate({
      currentTime: this.video.currentTime,
      duration,
      state: 'paused',
      action: 'stopped',
    })
  }
}

export function findPrimaryVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll('video'))
  if (videos.length === 0) return null

  return videos.reduce((best, video) => {
    const area = video.clientWidth * video.clientHeight
    const bestArea = best.clientWidth * best.clientHeight
    return area > bestArea ? video : best
  })
}
