"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import RoomStatePanel from "@/components/live/room-state-panel"
import { Button } from "@/components/ui/button"
import { LiveApiError, getRoomState } from "@/lib/client/live-api"
import { getHostToken } from "@/lib/client/live-session"
import type { RoomSnapshot } from "@/lib/server/types"

const POLL_MS = 1500

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

  const refreshState = useCallback(async () => {
    if (!hostToken) {
      return
    }

    try {
      const response = await getRoomState(roomId, hostToken)
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [hostToken, roomId])

  useEffect(() => {
    if (!hostToken) {
      return
    }

    const bootstrap = window.setTimeout(() => {
      void refreshState()
    }, 0)
    const timer = window.setInterval(() => {
      void refreshState()
    }, POLL_MS)

    return () => {
      window.clearTimeout(bootstrap)
      window.clearInterval(timer)
    }
  }, [hostToken, refreshState])

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-white">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">TV Room View</h1>
          <p className="text-sm text-slate-300">Room: {roomId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" type="button" onClick={() => void refreshState()} disabled={!hostToken}>
            Refresh
          </Button>
          <Link href="/host" className="text-cyan-300 underline">
            Host Controls
          </Link>
        </div>
      </header>

      {!hostToken ? (
        <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Host token is not available in this browser. Login first at <Link className="underline" href="/host">/host</Link>.
        </section>
      ) : null}

      {error ? <p className="mb-4 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}

      {room ? (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {room.teams.map((team) => (
              <article key={team.teamId} className="rounded-2xl border border-white/20 bg-black/30 p-6 text-center">
                <p className="text-xl text-slate-200">{team.name}</p>
                <p className="mt-2 text-7xl font-bold text-amber-300">{team.score}</p>
                <p className="mt-2 text-sm text-slate-300">Players: {team.playerCount}</p>
              </article>
            ))}
          </div>
          <RoomStatePanel room={room} highlightPlayerId={room.trivia.currentResponderPlayerId} />
        </section>
      ) : (
        <p className="text-sm text-slate-300">Waiting for room state...</p>
      )}
    </main>
  )
}
