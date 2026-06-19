export const DEFAULT_MYSHOWS_RPC_URL = 'https://api.myshows.me/v2/rpc/'

export interface MyShowsShow {
  id?: number
  title?: string
  titleOriginal?: string
  year?: number
  kinopoiskId?: number
  imdbId?: string
}

interface JsonRpcResponse<T> {
  jsonrpc: string
  result?: T
  error?: { code: number; message: string }
  id: number
}

export class MyShowsRpcClient {
  constructor(
    private token: string,
    private rpcUrl: string = DEFAULT_MYSHOWS_RPC_URL,
  ) {}

  async getByExternalId(
    source: 'kinopoisk' | 'imdb',
    id: number | string,
  ): Promise<MyShowsShow | null> {
    try {
      const params =
        source === 'imdb'
          ? { id, source }
          : { id: typeof id === 'string' ? parseInt(id, 10) : id, source }

      const result = await this.call<MyShowsShow>('shows.GetByExternalId', params)
      return result?.id ? result : null
    } catch {
      return null
    }
  }

  async searchShows(query: string, limit = 8): Promise<MyShowsShow[]> {
    const trimmed = query.trim()
    if (!trimmed) return []

    const result = await this.call<MyShowsShow[]>('shows.Search', { query: trimmed })
    return (result ?? []).slice(0, limit)
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        'Accept-Language': 'ru',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`MyShows RPC: ${response.status} ${text}`)
    }

    const data = (await response.json()) as JsonRpcResponse<T>
    if (data.error) {
      throw new Error(data.error.message || `RPC error ${data.error.code}`)
    }
    if (data.result === undefined) {
      throw new Error('MyShows RPC: empty result')
    }
    return data.result
  }
}
