import { formatOverrideKey } from '../lib/match-overrides.js'
import type { MatchOverrideListItem, MyShowsShowResult } from '../lib/types.js'

const searchForm = document.getElementById('search-form') as HTMLFormElement
const searchQuery = document.getElementById('search-query') as HTMLInputElement
const searchResultsEl = document.getElementById('search-results')!
const matchListEl = document.getElementById('match-list')!
const listEmptyEl = document.getElementById('list-empty')!
const refreshBtn = document.getElementById('refresh-list')!

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function showMeta(show: MyShowsShowResult): string {
  return [
    show.year ? String(show.year) : null,
    show.kinopoiskId ? `KP ${show.kinopoiskId}` : null,
    show.imdbId ?? null,
    show.id ? `ID ${show.id}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

async function loadMatches(): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'LIST_MATCH_OVERRIDES' })
  if (!res?.ok) {
    matchListEl.innerHTML = '<p class="muted">Не удалось загрузить список</p>'
    return
  }

  const items = (res.matches ?? []) as MatchOverrideListItem[]
  listEmptyEl.classList.toggle('hidden', items.length > 0)

  if (items.length === 0) {
    matchListEl.innerHTML = ''
    return
  }

  matchListEl.innerHTML = items.map(renderMatchItem).join('')
  bindMatchItems(items)
}

function renderMatchItem(item: MatchOverrideListItem): string {
  const badge =
    item.override.matchSource === 'auto'
      ? '<span class="badge">авто</span>'
      : '<span class="badge manual">вручную</span>'

  return `
    <article class="match-item" data-key="${escapeHtml(item.key)}">
      <p class="match-item-title">
        ${escapeHtml(item.override.sourceLabel ?? formatOverrideKey(item.key))}
        ${badge}
      </p>
      <p class="match-item-meta">${escapeHtml(formatOverrideKey(item.key))}</p>
      <form class="match-item-form">
        <input type="text" name="title" placeholder="Название на MyShows" value="${escapeHtml(item.override.title ?? '')}" />
        <input type="number" name="myshowId" placeholder="ID сериала на MyShows" value="${item.override.myshowId ?? ''}" />
        <div class="match-item-actions">
          <button type="submit">Сохранить</button>
          <button type="button" class="danger delete-btn">Удалить</button>
        </div>
      </form>
    </article>
  `
}

function bindMatchItems(items: MatchOverrideListItem[]): void {
  const articles = matchListEl.querySelectorAll<HTMLElement>('.match-item')
  articles.forEach((article, index) => {
    const item = items[index]
    if (!item) return

    const form = article.querySelector<HTMLFormElement>('.match-item-form')!
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim()
      const myshowIdRaw = (form.elements.namedItem('myshowId') as HTMLInputElement).value.trim()
      const myshowId = myshowIdRaw ? parseInt(myshowIdRaw, 10) : undefined

      await chrome.runtime.sendMessage({
        type: 'SAVE_MATCH_BY_KEY',
        payload: {
          key: item.key,
          override: {
            title: title || undefined,
            myshowId,
            sourceLabel: item.override.sourceLabel,
          },
        },
      })
      await loadMatches()
    })

    article.querySelector('.delete-btn')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({
        type: 'DELETE_MATCH_OVERRIDE',
        payload: { key: item.key },
      })
      await loadMatches()
    })
  })
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const query = searchQuery.value.trim()
  if (!query) return

  searchResultsEl.innerHTML = '<p class="muted">Поиск…</p>'
  const res = await chrome.runtime.sendMessage({
    type: 'SEARCH_MYSHOWS_SHOWS',
    payload: { query },
  })

  if (!res?.ok) {
    searchResultsEl.innerHTML = `<p class="muted">${escapeHtml(res?.error ?? 'Ошибка поиска')}</p>`
    return
  }

  const results = (res.searchResults ?? []) as MyShowsShowResult[]
  if (results.length === 0) {
    searchResultsEl.innerHTML = '<p class="muted">Ничего не найдено</p>'
    return
  }

  searchResultsEl.innerHTML = results.map(renderSearchResult).join('')
  bindSearchResults(results, query)
})

function renderSearchResult(show: MyShowsShowResult): string {
  const title = show.title ?? show.titleOriginal ?? 'Без названия'
  return `
    <div class="search-result" data-show-id="${show.id ?? ''}">
      <p class="search-result-title">${escapeHtml(title)}</p>
      <p class="search-result-meta">${escapeHtml(showMeta(show))}</p>
      <button type="button" class="secondary pick-btn">Сохранить сопоставление</button>
    </div>
  `
}

function bindSearchResults(results: MyShowsShowResult[], query: string): void {
  const cards = searchResultsEl.querySelectorAll<HTMLElement>('.search-result')
  cards.forEach((card, index) => {
    const show = results[index]
    if (!show?.id) return

    card.querySelector('.pick-btn')?.addEventListener('click', async () => {
      const override = {
        title: show.title ?? show.titleOriginal,
        myshowId: show.id,
        sourceLabel: query,
      }

      if (show.kinopoiskId) {
        await chrome.runtime.sendMessage({
          type: 'SAVE_MATCH_BY_KEY',
          payload: { key: `kp:${show.kinopoiskId}`, override },
        })
      } else if (show.imdbId) {
        await chrome.runtime.sendMessage({
          type: 'SAVE_MATCH_BY_KEY',
          payload: { key: `imdb:${show.imdbId}`, override },
        })
      } else {
        await chrome.runtime.sendMessage({
          type: 'SAVE_MATCH_BY_KEY',
          payload: { key: `myshow:${show.id}`, override },
        })
      }

      await loadMatches()
      card.querySelector('.pick-btn')!.textContent = 'Сохранено'
    })
  })
}

refreshBtn.addEventListener('click', () => loadMatches())
loadMatches()
