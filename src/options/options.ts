import type { ExtensionSettings } from '../lib/types.js'

const form = document.getElementById('settings-form') as HTMLFormElement
const tokenEl = document.getElementById('token') as HTMLInputElement
const apiUrlEl = document.getElementById('api-url') as HTMLInputElement
const percentEl = document.getElementById('scrobble-percent') as HTMLInputElement
const enabledEl = document.getElementById('enabled') as HTMLInputElement
const feedbackEl = document.getElementById('feedback')!
const checkTokenEl = document.getElementById('check-token')!

function showFeedback(text: string, type: 'ok' | 'error' | ''): void {
  feedbackEl.textContent = text
  feedbackEl.className = type
}

async function load(): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
  if (!res?.ok || !res.settings) return

  const s = res.settings as ExtensionSettings
  tokenEl.value = s.myshowsToken
  apiUrlEl.value = s.myshowsUrl
  percentEl.value = String(s.scrobblePercent)
  enabledEl.checked = s.enabled
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const res = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    payload: {
      myshowsToken: tokenEl.value.trim(),
      myshowsUrl: apiUrlEl.value.trim(),
      scrobblePercent: Number(percentEl.value),
      enabled: enabledEl.checked,
    },
  })

  if (res?.ok) {
    showFeedback('Настройки сохранены', 'ok')
  } else {
    showFeedback(res?.error ?? 'Ошибка сохранения', 'error')
  }
})

checkTokenEl.addEventListener('click', async () => {
  showFeedback('Проверка…', '')
  const res = await chrome.runtime.sendMessage({
    type: 'CHECK_TOKEN',
    payload: { token: tokenEl.value.trim(), url: apiUrlEl.value.trim() },
  })

  if (res?.ok && res.valid) {
    showFeedback('Токен действителен', 'ok')
  } else {
    showFeedback(res?.error ?? 'Токен недействителен', 'error')
  }
})

load()
