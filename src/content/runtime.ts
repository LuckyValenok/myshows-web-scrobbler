type ShutdownHandler = () => void

let shutdownHandler: ShutdownHandler | null = null

export function onExtensionShutdown(handler: ShutdownHandler): void {
  shutdownHandler = handler
}

function triggerShutdown(): void {
  shutdownHandler?.()
  shutdownHandler = null
}

export function isContextAlive(): boolean {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

function isContextInvalidError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return (
    message.includes('Extension context invalidated') ||
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  )
}

export function sendMessage<T = unknown>(
  message: unknown,
  callback?: (response: T) => void,
): boolean {
  if (!isContextAlive()) {
    triggerShutdown()
    return false
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) {
        if (isContextInvalidError(err.message)) {
          triggerShutdown()
        }
        return
      }
      callback?.(response as T)
    })
    return true
  } catch (error) {
    if (isContextInvalidError(error)) {
      triggerShutdown()
    }
    return false
  }
}
