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
  const quickAvatars = ["🙂", "😎", "🤩", "🔥", "⭐", "🎉", "🧠", "🚀"]

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
      <div className="party-stage-bg" />
      <div className="party-stage-grid" />
      <div className="pointer-events-none fixed -left-20 top-24 h-64 w-64 rounded-full bg-amber-300/30 blur-3xl" />
      <div className="pointer-events-none fixed -right-24 top-32 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:py-10">
        <header className="mb-6 text-center">
          <p className="inline-flex party-chip px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/90">
            Join Room
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">جاهز تدخل اللعبة؟</h1>
          <p className="mt-2 text-base text-slate-200">اكتب اسمك واختر رمزك ثم ادخل مباشرة إلى وحدة التحكم.</p>
          <p className="mx-auto mt-3 inline-flex rounded-full border border-white/20 bg-black/20 px-4 py-1.5 text-sm font-medium text-slate-100">
            Room ID: <span className="ml-2 font-mono text-amber-200">{roomId}</span>
          </p>
        </header>

        <section className="party-surface-strong rounded-4xl p-6 sm:p-7">
          <form className="space-y-5" onSubmit={handleJoin}>
            <label className="block text-sm font-semibold text-slate-100">
              الاسم المستعار
              <input
                className="mt-2 h-12 w-full rounded-2xl border border-white/20 bg-white/10 px-4 text-base text-white placeholder:text-slate-300/70 transition focus:border-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-300/25"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="مثال: خالد السريع"
                required
                minLength={2}
                maxLength={40}
              />
            </label>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-100">
                الرمز التعبيري
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-white/20 bg-white/10 px-4 text-2xl transition focus:border-cyan-300 focus:outline-none focus:ring-4 focus:ring-cyan-300/25"
                  value={avatarEmoji}
                  onChange={(event) => setAvatarEmoji(event.target.value)}
                  maxLength={8}
                />
              </label>
              <div className="grid grid-cols-8 gap-2">
                {quickAvatars.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setAvatarEmoji(avatar)}
                    className={`h-11 rounded-xl border text-2xl transition hover:scale-105 ${avatarEmoji === avatar
                      ? "border-amber-300 bg-amber-400/25 shadow-[0_0_20px_rgba(251,191,36,0.45)]"
                      : "border-white/20 bg-white/10"
                      }`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              className="h-14 w-full rounded-2xl bg-gradient-to-r from-amber-400 via-pink-400 to-cyan-400 text-lg font-black text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.35)] transition hover:scale-[1.01]"
              disabled={busy}
            >
              {busy ? "جاري الانضمام..." : "ادخل إلى وحدة التحكم"}
            </Button>
          </form>

          {hasExistingSession ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-12 w-full rounded-2xl border-white/25 bg-white/10 text-slate-100 hover:bg-white/20"
              onClick={() => router.push(`/controller/${roomId}`)}
            >
              متابعة الجلسة الحالية
            </Button>
          ) : null}

          {error ? (
            <p className="party-status-error mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</p>
          ) : null}
        </section>

        <p className="mt-6 text-center text-sm text-slate-200">
          لوحة تحكم المضيف:{" "}
          <Link className="font-bold text-cyan-200 underline underline-offset-2" href="/host">
            /host
          </Link>
        </p>
      </main>
    </div>
  )
}
