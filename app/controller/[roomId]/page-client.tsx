"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { LiveApiError, getRoomState, makeRequestId, reconnectPlayer, sendAction } from "@/lib/client/live-api"
import { clearPlayerSession, getPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/client/live-session"
import type { RoomSnapshot } from "@/lib/server/types"

const POLL_MS = 1200
const HEARTBEAT_MS = 10000

type ControllerClientPageProps = {
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

function optionLetter(index: number) {
  return ["A", "B", "C", "D"][index] ?? "?"
}

function shouldRetrySubmit(error: unknown) {
  if (!(error instanceof LiveApiError)) {
    return false
  }

  if (error.status >= 500) {
    return true
  }

  return error.code === "EMPTY_RESPONSE" || error.code === "UNKNOWN_ERROR"
}

export default function ControllerClientPage({ roomId }: ControllerClientPageProps) {
  const [session, setSession] = useState<PlayerSession | null>(() => getPlayerSession(roomId))
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [submittedQuestionId, setSubmittedQuestionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const hydrateState = useCallback(async () => {
    if (!session) {
      return
    }

    try {
      const response = await reconnectPlayer(roomId, session.token)
      setRoom(response.room)
      setSession((previous) => {
        const next = {
          roomId,
          playerId: response.player.id,
          playerName: response.player.name,
          token: previous?.token ?? session.token,
        }
        savePlayerSession(next)
        return next
      })
      setError(null)
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [roomId, session])

  const refreshState = useCallback(async () => {
    if (!session) {
      return
    }

    try {
      const response = await getRoomState(roomId, session.token)
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [roomId, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const bootstrap = window.setTimeout(() => {
      void hydrateState()
    }, 0)

    return () => {
      window.clearTimeout(bootstrap)
    }
  }, [hydrateState, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const bootstrap = window.setTimeout(() => {
      if (!busy) {
        void refreshState()
      }
    }, 0)
    const timer = window.setInterval(() => {
      if (!busy) {
        void refreshState()
      }
    }, POLL_MS)

    return () => {
      window.clearTimeout(bootstrap)
      window.clearInterval(timer)
    }
  }, [busy, refreshState, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const timer = window.setInterval(() => {
      void sendAction(roomId, session.token, "player.heartbeat")
    }, HEARTBEAT_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [roomId, session])

  const canAnswer = useMemo(() => {
    if (!room || !session) {
      return false
    }

    if (room.trivia.status !== "in_progress") {
      return false
    }

    const phase = room.trivia.phase
    const isActivePhase = phase === "question_active_primary_team" || phase === "question_active_steal_team"
    if (!isActivePhase) {
      return false
    }

    const questionId = room.trivia.currentQuestion?.id ?? null
    if (!questionId) {
      return false
    }

    if (submittedQuestionId === questionId) {
      return false
    }

    return room.trivia.currentResponderPlayerId === session.playerId
  }, [room, session, submittedQuestionId])

  const submitAnswer = async (option: string) => {
    if (!session || !room?.trivia.currentQuestion?.id || busy) {
      return
    }

    const questionId = room.trivia.currentQuestion.id
    const submitRequestId = makeRequestId()
    setBusy(true)
    setSubmittedQuestionId(questionId)
    setError(null)
    setNotice(`Submitting ${option}...`)

    try {
      let ack: Awaited<ReturnType<typeof sendAction>>
      try {
        ack = await sendAction(roomId, session.token, "player.submitAnswer", { option }, submitRequestId)
      } catch (firstError) {
        if (!shouldRetrySubmit(firstError)) {
          throw firstError
        }

        ack = await sendAction(roomId, session.token, "player.submitAnswer", { option }, submitRequestId)
      }

      setRoom(ack.payload.room)
      setNotice(`Answer submitted: ${option}`)
    } catch (requestError) {
      setSubmittedQuestionId(null)
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const clearSession = () => {
    clearPlayerSession(roomId)
    setSession(null)
    setRoom(null)
    setSubmittedQuestionId(null)
    setError(null)
    setNotice(null)
  }

  const currentQuestion = room?.trivia.currentQuestion ?? null

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 text-white">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Controller</h1>
          <p className="text-sm text-slate-300">{session ? session.playerName : "Player"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" type="button" onClick={() => void hydrateState()} disabled={!session || busy} className="touch-manipulation">
            Reconnect
          </Button>
        </div>
      </header>

      {!session ? (
        <section className="rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-sm text-slate-200">No local player session found for this room.</p>
          <p className="mt-2 text-sm text-slate-300">
            Join first via <Link className="text-cyan-300 underline" href={`/join/${roomId}`}>/join/{roomId}</Link>.
          </p>
          {error ? <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        </section>
      ) : (
        <article className="rounded-2xl border border-white/15 bg-black/30 p-5">
          {currentQuestion ? (
            <>
              <p className="text-xs uppercase tracking-wide text-slate-300">Question</p>
              <p className="mt-2 text-xl font-semibold leading-relaxed">{currentQuestion.prompt}</p>

              <div className="mt-5 grid gap-3">
                {currentQuestion.options.map((optionText, index) => {
                  const option = optionLetter(index)
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant="outline"
                      disabled={!canAnswer || busy}
                      onClick={() => void submitAnswer(option)}
                      className="touch-manipulation h-auto min-h-16 justify-start whitespace-normal py-4 text-right text-base"
                    >
                      <span className="font-semibold">{option}.</span>
                      <span className="mr-2">{optionText}</span>
                    </Button>
                  )
                })}
              </div>

              <p className="mt-4 text-sm text-slate-300">
                {canAnswer ? "Your turn: choose one answer." : "Waiting for your turn."}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-300">Waiting for host to start the question.</p>
          )}

          {error ? <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          {notice ? <p className="mt-3 rounded-md bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">{notice}</p> : null}
        </article>
      )}
      <div className="mt-4">
        <Button variant="ghost" type="button" onClick={clearSession} className="touch-manipulation text-slate-300">
          Leave Controller Session
        </Button>
      </div>
    </main>
  )
}
