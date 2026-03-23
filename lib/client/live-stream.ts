import { LiveApiError, type RoomStateResult } from "@/lib/client/live-api"

type StreamErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: Record<string, unknown>
  }
}

type StreamHandlers = {
  roomId: string
  token: string
  onState: (event: RoomStateResult) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: unknown) => void
}

const FATAL_STREAM_ERROR_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "ROOM_NOT_ACTIVE",
  "ROOM_INACTIVE",
  "ROOM_TOKEN_MISMATCH",
])

function safeParseJson<T>(text: string) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function parseSsePacket(packet: string) {
  if (!packet || packet.startsWith(":")) {
    return null
  }

  const normalized = packet.replace(/\r/g, "")
  const lines = normalized.split("\n")
  let eventName = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim()
      continue
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event: eventName,
    data: dataLines.join("\n"),
  }
}

function findPacketSeparator(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer)
  if (!match || typeof match.index !== "number") {
    return null
  }

  return {
    index: match.index,
    length: match[0].length,
  }
}

function isFatalStreamFailure(error: unknown) {
  if (!(error instanceof LiveApiError)) {
    return false
  }

  if (error.status === 401 || error.status === 403) {
    return true
  }

  return FATAL_STREAM_ERROR_CODES.has(error.code)
}

export function subscribeRoomStateStream(handlers: StreamHandlers) {
  let closed = false
  let activeController: AbortController | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempt = 0

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (closed) {
      return
    }

    const backoffMs = Math.min(1000 * 2 ** Math.min(reconnectAttempt, 4), 5000) + Math.floor(Math.random() * 250)
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, backoffMs)
  }

  const connect = async () => {
    if (closed) {
      return
    }

    let shouldReconnect = true
    clearReconnect()
    const controller = new AbortController()
    activeController = controller

    try {
      const response = await fetch(`/api/rooms/${handlers.roomId}/stream`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${handlers.token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      })

      if (!response.ok) {
        const bodyText = await response.text()
        const parsedBody = safeParseJson<StreamErrorBody>(bodyText)
        throw new LiveApiError(
          response.status,
          parsedBody?.error?.code ?? "STREAM_CONNECT_FAILED",
          parsedBody?.error?.message ?? `Stream failed with status ${response.status}`,
          parsedBody?.error?.details
        )
      }

      if (!response.body) {
        throw new LiveApiError(response.status, "STREAM_EMPTY_BODY", "Stream response body is empty")
      }

      reconnectAttempt = 0
      handlers.onOpen?.()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (!closed) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        let separatorMatch = findPacketSeparator(buffer)
        while (separatorMatch) {
          const packet = buffer.slice(0, separatorMatch.index)
          buffer = buffer.slice(separatorMatch.index + separatorMatch.length)
          separatorMatch = findPacketSeparator(buffer)

          const parsedPacket = parseSsePacket(packet)
          if (!parsedPacket) {
            continue
          }

          if (parsedPacket.event === "room.state") {
            const parsedState = safeParseJson<RoomStateResult>(parsedPacket.data)
            if (parsedState?.payload?.room) {
              handlers.onState(parsedState)
            }
            continue
          }

          if (parsedPacket.event === "room.error") {
            const parsedErrorBody = safeParseJson<StreamErrorBody>(parsedPacket.data)
            const streamError = new LiveApiError(
              409,
              parsedErrorBody?.error?.code ?? "STREAM_ROOM_ERROR",
              parsedErrorBody?.error?.message ?? "Live stream reported room error",
              parsedErrorBody?.error?.details
            )
            handlers.onError?.(streamError)
            if (isFatalStreamFailure(streamError)) {
              shouldReconnect = false
              return
            }
          }
        }
      }
    } catch (error) {
      if (closed) {
        return
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      handlers.onError?.(error)
      if (isFatalStreamFailure(error)) {
        shouldReconnect = false
      }
    } finally {
      if (activeController === controller) {
        activeController = null
      }
      handlers.onClose?.()
    }

    if (shouldReconnect) {
      scheduleReconnect()
    }
  }

  void connect()

  return () => {
    closed = true
    clearReconnect()
    if (activeController) {
      activeController.abort()
      activeController = null
    }
  }
}
