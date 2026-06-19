import type { UpdateStatus } from '../lib/update-check.js'

export function renderUpdateBanner(status: UpdateStatus, containerId?: string): string {
  if (!status.updateAvailable || !status.latestVersion) {
    return ''
  }

  const idAttr = containerId ? ` id="${containerId}"` : ''

  return `
    <div class="update-banner"${idAttr}>
      <div class="update-banner-text">
        <strong>Доступна версия ${escapeHtml(status.latestVersion)}</strong>
        <span>У вас ${escapeHtml(status.currentVersion)}. Скачайте zip и перезагрузите расширение.</span>
      </div>
      <div class="update-banner-actions">
        <a href="${escapeHtml(status.downloadUrl ?? status.releaseUrl ?? '#')}" target="_blank" rel="noreferrer" class="update-download">Скачать</a>
        <button type="button" class="update-dismiss secondary">Скрыть</button>
      </div>
    </div>
  `
}

export function bindUpdateBanner(
  root: ParentNode,
  status: UpdateStatus,
  onDismiss?: () => void,
): void {
  root.querySelector('.update-dismiss')?.addEventListener('click', async () => {
    if (!status.latestVersion) return
    await chrome.runtime.sendMessage({
      type: 'DISMISS_UPDATE',
      payload: { version: status.latestVersion },
    })
    root.querySelector('.update-banner')?.remove()
    onDismiss?.()
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
