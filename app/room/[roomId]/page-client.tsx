"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import RoomStatePanel from "@/components/live/room-state-panel"
import { Button } from "@/components/ui/button"
import { LiveApiError, getRoomState } from "@/lib/client/live-api"
import { getHostToken } from "@/lib/client/live-session"
import type { RoomSnapshot } from "@/lib/server/types"

const POLL_MS = 2000

function isDocumentVisible() {
  if (typeof document === "undefined") {
    return true
  }

  return document.visibilityState === "visible"
}

type RoomDisplayClientPageProps = {
  roomId: string
}

function toErrorMessage(error: unknown) {
  if (error instanceof LiveApiError) {
    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

export default function RoomDisplayClientPage({ roomId }: RoomDisplayClientPageProps) {
  const [hostToken] = useState<string | null>(() => getHostToken())
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)

  const refreshState = useCallback(async () => {
    if (!hostToken) {
      return
    }
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true

    try {
      const response = await getRoomState(roomId, hostToken)
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    } finally {
      refreshInFlightRef.current = false
    }
  }, [hostToken, roomId])

  useEffect(() => {
    if (!hostToken) {
      return
    }

    const bootstrap = window.setTimeout(() => {
      if (isDocumentVisible()) {
        void refreshState()
      }
    }, 0)
    const timer = window.setInterval(() => {
      if (isDocumentVisible()) {
        void refreshState()
      }
    }, POLL_MS)

    return () => {
      window.clearTimeout(bootstrap)
      window.clearInterval(timer)
    }
  }, [hostToken, refreshState])

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className="party-stage-bg" />
      <div className="party-stage-grid" />
      <div className="pointer-events-none fixed -left-20 top-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="pointer-events-none fixed -right-20 top-40 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-white">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">Diagnostic View</p>
            <h1 className="mt-1 text-4xl font-black">TV Room View</h1>
            <p className="mt-1 text-sm text-slate-300">Room: {roomId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={() => void refreshState()} disabled={!hostToken} className="border-white/30 bg-white/10">
              Refresh
            </Button>
            <Link href="/host" className="text-cyan-300 underline">
              Host Controls
            </Link>
          </div>
        </header>

        {!hostToken ? (
          <section className="party-surface rounded-xl p-4 text-sm text-violet-100">
            Host token is not available in this browser. Login first at <Link className="underline" href="/host">/host</Link>.
          </section>
        ) : null}

        {error ? <p className="party-status-error mb-4 rounded-xl px-4 py-3 text-sm">{error}</p> : null}

        {room ? (
          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {room.teams.map((team) => (
                <article key={team.teamId} className="party-surface rounded-2xl p-6 text-center">
                  <p className="text-xl text-slate-200">{team.name}</p>
                  <p className="mt-2 text-7xl font-black text-amber-300">{team.score}</p>
                  <p className="mt-2 text-sm text-slate-300">Players: {team.playerCount}</p>
                </article>
              ))}
            </div>
            <div className="party-surface rounded-2xl p-4">
              <RoomStatePanel room={room} highlightPlayerId={room.trivia.currentResponderPlayerId} />
            </div>
          </section>
        ) : (
          <p className="text-sm text-slate-300">Waiting for room state...</p>
        )}
      </main>
    </div>
  )
}
