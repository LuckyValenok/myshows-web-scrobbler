import type { MediaMetadata } from '../lib/types.js'
import { findAdapter } from './hdrezka.js'

export function extractPageMetadata(): MediaMetadata | null {
  if (window !== window.top) {
    return null
  }

  const adapter = findAdapter(window.location.hostname)
  if (!adapter) return null

  return adapter.extractMetadata(document, window.location.href)
}

export function isSupportedSite(): boolean {
  return findAdapter(window.location.hostname) !== null
}
