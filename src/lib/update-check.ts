import { APP_VERSION } from './types.js'

export const GITHUB_REPO = 'LuckyValenok/myshows-web-scrobbler'
const CACHE_KEY = 'updateStatus'
const DISMISS_KEY = 'dismissedUpdateVersion'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

export interface UpdateStatus {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  downloadUrl: string | null
  checkedAt: string | null
  error?: string
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: Array<{ name: string; browser_download_url: string }>
}

export function parseVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0)
}

export function isVersionNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  const dismissed = await getDismissedVersion()
  const cached = await loadCachedStatus()

  if (!force && cached && !isCacheExpired(cached.checkedAt)) {
    return applyDismiss(cached, dismissed)
  }

  try {
    const status = await fetchLatestRelease()
    await chrome.storage.local.set({ [CACHE_KEY]: status })
    return applyDismiss(status, dismissed)
  } catch (err) {
    const fallback: UpdateStatus = {
      currentVersion: APP_VERSION,
      latestVersion: cached?.latestVersion ?? null,
      updateAvailable: cached?.updateAvailable ?? false,
      releaseUrl: cached?.releaseUrl ?? null,
      downloadUrl: cached?.downloadUrl ?? null,
      checkedAt: cached?.checkedAt ?? null,
      error: err instanceof Error ? err.message : String(err),
    }
    return applyDismiss(fallback, dismissed)
  }
}

export async function dismissUpdate(version: string): Promise<void> {
  await chrome.storage.local.set({ [DISMISS_KEY]: version })
}

async function getDismissedVersion(): Promise<string | null> {
  const result = await chrome.storage.local.get(DISMISS_KEY)
  return (result[DISMISS_KEY] as string) ?? null
}

function applyDismiss(status: UpdateStatus, dismissed: string | null): UpdateStatus {
  if (!status.updateAvailable || !status.latestVersion) return status
  if (dismissed && dismissed === status.latestVersion) {
    return { ...status, updateAvailable: false }
  }
  return status
}

async function loadCachedStatus(): Promise<UpdateStatus | null> {
  const result = await chrome.storage.local.get(CACHE_KEY)
  return (result[CACHE_KEY] as UpdateStatus) ?? null
}

function isCacheExpired(checkedAt: string | null): boolean {
  if (!checkedAt) return true
  return Date.now() - new Date(checkedAt).getTime() > CACHE_TTL_MS
}

async function fetchLatestRelease(): Promise<UpdateStatus> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })

  if (!response.ok) {
    throw new Error(`GitHub API: ${response.status}`)
  }

  const release = (await response.json()) as GitHubRelease
  const latestVersion = release.tag_name.replace(/^v/i, '')
  const zipAsset = release.assets.find((asset) => asset.name.endsWith('.zip'))

  return {
    currentVersion: APP_VERSION,
    latestVersion,
    updateAvailable: isVersionNewer(latestVersion, APP_VERSION),
    releaseUrl: release.html_url,
    downloadUrl: zipAsset?.browser_download_url ?? release.html_url,
    checkedAt: new Date().toISOString(),
  }
}
