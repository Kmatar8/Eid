"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { LiveApiError, joinRoom } from "@/lib/client/live-api"
import { getPlayerSession, savePlayerSession } from "@/lib/client/live-session"

type JoinRoomClientPageProps = {
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

export default function JoinRoomClientPage({ roomId }: JoinRoomClientPageProps) {
  const router = useRouter()
  const existingSession = getPlayerSession(roomId)
  const [name, setName] = useState(existingSession?.playerName ?? "")
  const [avatarEmoji, setAvatarEmoji] = useState("🙂")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasExistingSession] = useState(Boolean(existingSession))

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await joinRoom(roomId, name.trim(), avatarEmoji.trim() || undefined)
      savePlayerSession({
        roomId,
        playerId: response.player.id,
        playerName: response.player.name,
        token: response.playerToken,
      })
      router.push(`/controller/${roomId}`)
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-4 py-8 text-white">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Join Room</h1>
        <p className="mt-1 text-sm text-slate-300">Room: {roomId}</p>
      </header>

      <section className="rounded-xl border border-white/15 bg-white/5 p-4">
        <form className="space-y-3" onSubmit={handleJoin}>
          <label className="block text-sm">
            Display Name
            <input
              className="mt-1 w-full rounded-md border border-white/20 bg-black/30 px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="2-40 characters"
              required
              minLength={2}
              maxLength={40}
            />
          </label>

          <label className="block text-sm">
            Avatar Emoji (optional)
            <input
              className="mt-1 w-full rounded-md border border-white/20 bg-black/30 px-3 py-2"
              value={avatarEmoji}
              onChange={(event) => setAvatarEmoji(event.target.value)}
              maxLength={8}
            />
          </label>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Joining..." : "Join Room"}
          </Button>
        </form>

        {hasExistingSession ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => router.push(`/controller/${roomId}`)}
          >
            Continue Existing Session
          </Button>
        ) : null}

        {error ? <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}
      </section>

      <p className="mt-4 text-sm text-slate-300">
        Host controls are available at <Link className="text-cyan-300 underline" href="/host">/host</Link>.
      </p>
    </main>
  )
}
