import type { MediaMetadata, NowPlayingEntry } from '../lib/types.js'
import { formatTitle } from '../lib/converter.js'

const statusEl = document.getElementById('status')!
const enabledEl = document.getElementById('enabled') as HTMLInputElement
const openOptionsEl = document.getElementById('open-options')!
const openMatchesEl = document.getElementById('open-matches')!

async function load(): Promise<void> {
  const [settingsRes, statusRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }),
  ])

  if (settingsRes?.ok && settingsRes.settings) {
    enabledEl.checked = settingsRes.settings.enabled
    if (!settingsRes.settings.myshowsToken) {
      statusEl.innerHTML =
        '<p class="error">Токен не настроен. <a href="#" id="setup-link">Открыть настройки</a></p>'
      document.getElementById('setup-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        chrome.runtime.openOptionsPage()
      })
      return
    }
  }

  if (!statusRes?.ok) {
    statusEl.innerHTML = '<p class="error">Не удалось загрузить статус</p>'
    return
  }

  const items = statusRes.nowPlaying ?? []
  if (items.length === 0) {
    statusEl.innerHTML = '<p class="muted empty-state">Сейчас ничего не воспроизводится</p>'
    return
  }

  const blocks = await Promise.all(items.map(renderNowPlaying))
  statusEl.innerHTML = blocks.join('')
  bindMatchForms(items)
  statusEl.querySelectorAll('.open-matches').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      chrome.tabs.create({ url: chrome.runtime.getURL('src/matches/matches.html') })
    })
  })
}

async function renderNowPlaying(entry: NowPlayingEntry): Promise<string> {
  const title = formatTitle(entry.metadata)
  const meta = entry.metadata
  const ids = [
    meta.kinopoiskId ? `KP ${meta.kinopoiskId}` : null,
    meta.imdbId ?? null,
    meta.year ? String(meta.year) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const matchRes = await chrome.runtime.sendMessage({
    type: 'RESOLVE_SHOW_MATCH',
    payload: { metadata: meta },
  })
  const override = matchRes?.override
  const matchNote = override?.title
    ? `<p class="match-note ok">MyShows: «${escapeHtml(override.title)}»${override.matchSource === 'auto' ? ' <span class="badge">авто</span>' : ''}</p>`
    : `<p class="match-note">Не удалось сопоставить автоматически. Укажите вручную или откройте <a href="#" class="open-matches">сопоставления</a>.</p>`

  const stateLabel = entry.state === 'playing' ? 'Смотрю' : 'Пауза'
  const stateClass = entry.state === 'playing' ? '' : 'paused'

  return `
    <div class="now-playing" data-key="${escapeHtml(entry.metadata.siteId)}">
      <div class="now-playing-header">
        <p class="now-playing-title">${escapeHtml(title)}</p>
        <span class="state-badge ${stateClass}">${stateLabel}</span>
      </div>
      ${ids ? `<p class="meta-ids">${escapeHtml(ids)}</p>` : ''}
      ${matchNote}
      <form class="match-form">
        <input type="text" name="title" placeholder="Название на MyShows" value="${escapeHtml(override?.title ?? '')}" />
        <input type="number" name="myshowId" placeholder="ID сериала на MyShows (необязательно)" value="${override?.myshowId ?? ''}" />
        <button type="submit">Запомнить сопоставление</button>
      </form>
      <div class="progress-row">
        <div class="progress"><span style="width: ${entry.percent}%"></span></div>
        <span class="progress-label">${entry.percent.toFixed(0)}%</span>
      </div>
    </div>
  `
}

function bindMatchForms(items: NowPlayingEntry[]): void {
  const forms = statusEl.querySelectorAll<HTMLFormElement>('.match-form')
  forms.forEach((form, index) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const metadata = items[index]?.metadata
      if (!metadata) return

      const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim()
      const myshowIdRaw = (form.elements.namedItem('myshowId') as HTMLInputElement).value.trim()
      const myshowId = myshowIdRaw ? parseInt(myshowIdRaw, 10) : undefined

      if (!title && !myshowId) return

      await chrome.runtime.sendMessage({
        type: 'SAVE_MATCH_OVERRIDE',
        payload: { metadata, override: { title: title || undefined, myshowId } },
      })

      const note = form.previousElementSibling
      if (note?.classList.contains('match-note')) {
        note.textContent = title ? `MyShows: «${title}»` : 'Сопоставление сохранено'
        note.classList.add('ok')
      }
    })
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

enabledEl.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    payload: { enabled: enabledEl.checked },
  })
})

openOptionsEl.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

openMatchesEl.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.tabs.create({ url: chrome.runtime.getURL('src/matches/matches.html') })
})

load()
setInterval(load, 5000)
