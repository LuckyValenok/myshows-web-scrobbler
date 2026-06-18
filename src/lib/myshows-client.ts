import {
  MYSHOWS_ENDPOINTS,
  type ScrobbleEndpoint,
  type ScrobbleRequest,
  type ScrobbleResponse,
} from './scrobble-dto.js'

export class MyShowsClient {
  constructor(
    private token: string,
    private baseUrl: string,
  ) {}

  setToken(token: string): void {
    this.token = token
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '')
  }

  async checkToken(): Promise<{ valid: boolean; error?: string }> {
    if (!this.token) {
      return { valid: false, error: 'Токен не задан' }
    }

    try {
      await this.request(MYSHOWS_ENDPOINTS.CHECK, { method: 'GET' })
      return { valid: true }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sendScrobble(
    endpoint: ScrobbleEndpoint,
    payload: ScrobbleRequest,
  ): Promise<{ success: boolean; data?: ScrobbleResponse; error?: string }> {
    if (!this.token) {
      return { success: false, error: 'Токен не задан' }
    }

    let lastError: string | undefined

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await this.request<ScrobbleResponse>(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        return { success: true, data }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt < 3) {
          await sleep(2 ** (attempt - 1) * 1000)
        }
      }
    }

    return { success: false, error: lastError }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`MyShows API: ${response.status} ${text}`)
    }

    return response.json() as Promise<T>
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
