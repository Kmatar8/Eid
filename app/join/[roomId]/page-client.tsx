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
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,var(--festive-glow),transparent_52%),linear-gradient(160deg,var(--background)_0%,var(--secondary)_48%,var(--background)_100%)] z-[-2]" />
      <div className="pointer-events-none fixed inset-0 bg-[size:56px_56px] z-[-1] opacity-60" style={{ backgroundImage: 'linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)' }} />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold font-cairo">انضم للغرفة</h1>
          <p className="mt-1 text-sm text-muted-foreground">ID: {roomId}</p>
        </header>

        <section className="rounded-3xl border border-glass-border bg-glass-bg p-6 backdrop-blur-xl shadow-xl">
          <form className="space-y-4" onSubmit={handleJoin}>
            <label className="block text-sm font-medium">
              الاسم المستعار
              <input
                className="mt-1 w-full rounded-xl border border-glass-border bg-background/50 px-3 py-2 focus:ring-2 focus:ring-primary/20 transition-all"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="2-40 characters"
                required
                minLength={2}
                maxLength={40}
              />
            </label>

            <label className="block text-sm font-medium">
              رمز تعبيري (اختياري)
              <input
                className="mt-1 w-full rounded-xl border border-glass-border bg-background/50 px-3 py-2 focus:ring-2 focus:ring-primary/20 transition-all"
                value={avatarEmoji}
                onChange={(event) => setAvatarEmoji(event.target.value)}
                maxLength={8}
              />
            </label>

            <Button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-lg" disabled={busy}>
              {busy ? "جاري الانضمام..." : "انضم الآن"}
            </Button>
          </form>

          {hasExistingSession ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full h-12 rounded-xl border-glass-border bg-glass-bg/50"
              onClick={() => router.push(`/controller/${roomId}`)}
            >
              متابعة الجلسة الحالية
            </Button>
          ) : null}

          {error ? <p className="mt-4 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">{error}</p> : null}
        </section>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          لوحة تحكم المضيف متاحة هنا <Link className="text-primary underline font-bold" href="/host">/host</Link>.
        </p>
      </main>
    </div>
  )
}
