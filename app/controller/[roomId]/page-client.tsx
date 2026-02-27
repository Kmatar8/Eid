"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { LiveApiError, getRoomState, makeRequestId, reconnectPlayer, sendAction } from "@/lib/client/live-api"
import { clearPlayerSession, getPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/client/live-session"
import type { RoomSnapshot } from "@/lib/server/types"

const POLL_MS = 1200
const HEARTBEAT_MS = 10000
const CLOCK_TICK_MS = 300

type ControllerClientPageProps = {
  roomId: string
}

type TeamTone = {
  border: string
  text: string
  bg: string
}

const TEAM_TONES: Record<string, TeamTone> = {
  team_a: {
    border: "border-amber-300/50",
    text: "text-amber-100",
    bg: "bg-amber-500/10",
  },
  team_b: {
    border: "border-cyan-300/50",
    text: "text-cyan-100",
    bg: "bg-cyan-500/10",
  },
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

function getTeamTone(teamId: string | null | undefined): TeamTone {
  if (!teamId) {
    return {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/5",
    }
  }

  return (
    TEAM_TONES[teamId] ?? {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/5",
    }
  )
}

function remainingSeconds(targetTs: number | null, nowTs: number) {
  if (!targetTs) {
    return 0
  }
  return Math.max(0, Math.ceil((targetTs - nowTs) / 1000))
}

export default function ControllerClientPage({ roomId }: ControllerClientPageProps) {
  const [session, setSession] = useState<PlayerSession | null>(() => getPlayerSession(roomId))
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [submittedQuestionId, setSubmittedQuestionId] = useState<string | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
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
    const timer = window.setInterval(() => {
      setNowTs(Date.now())
    }, CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

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

  const selectedQuestionId = room?.trivia.selectedClue?.questionId ?? null
  useEffect(() => {
    if (selectedQuestionId !== submittedQuestionId) {
      setSubmittedQuestionId(null)
    }
  }, [selectedQuestionId, submittedQuestionId])

  const teamById = useMemo(() => new Map((room?.teams ?? []).map((team) => [team.teamId, team])), [room?.teams])
  const playerNameById = useMemo(
    () => new Map((room?.players ?? []).map((player) => [player.playerId, player.displayName])),
    [room?.players]
  )
  const teamByPlayerId = useMemo(
    () => new Map((room?.teamAssignments ?? []).map((entry) => [entry.playerId, entry.teamId])),
    [room?.teamAssignments]
  )

  const myTeamId = session ? teamByPlayerId.get(session.playerId) ?? null : null
  const myTeam = myTeamId ? teamById.get(myTeamId) ?? null : null
  const responderId = room?.trivia.currentResponderPlayerId ?? null
  const responderTeamId = room?.trivia.currentResponderTeamId ?? null
  const responderName = responderId ? playerNameById.get(responderId) ?? "Player" : null
  const responderTeam = responderTeamId ? teamById.get(responderTeamId) ?? null : null
  const activeTone = getTeamTone(responderTeamId ?? myTeamId)

  const canBuzz = useMemo(() => {
    if (!room || !session) {
      return false
    }
    return room.trivia.status === "in_progress" && room.trivia.phase === "buzzer_open" && !room.trivia.currentResponderPlayerId
  }, [room, session])

  const canAnswer = useMemo(() => {
    if (!room || !session || !selectedQuestionId) {
      return false
    }
    if (room.trivia.status !== "in_progress" || room.trivia.phase !== "answer_active") {
      return false
    }
    if (room.trivia.currentResponderPlayerId !== session.playerId) {
      return false
    }
    return submittedQuestionId !== selectedQuestionId
  }, [room, session, selectedQuestionId, submittedQuestionId])

  const countdownSeconds = remainingSeconds(room?.trivia.countdownEndsAt ?? null, nowTs)
  const buzzSeconds = remainingSeconds(room?.trivia.buzzEndsAt ?? null, nowTs)
  const answerSeconds = remainingSeconds(room?.trivia.answerEndsAt ?? null, nowTs)
  const selectedClue = room?.trivia.selectedClue ?? null
  const isCountdownPhase = room?.trivia.phase === "countdown"
  const isQuestionRevealed =
    room?.trivia.phase === "buzzer_open" || room?.trivia.phase === "answer_active" || room?.trivia.phase === "answer_reveal"

  const statusText = useMemo(() => {
    if (!room || !session || room.trivia.status !== "in_progress") {
      return "بانتظار بدء اللعبة من شاشة المضيف."
    }

    if (room.trivia.phase === "board_turn") {
      const pickerName = room.trivia.currentPickerPlayerId
        ? playerNameById.get(room.trivia.currentPickerPlayerId) ?? "Player"
        : "Player"
      const pickerTeam = room.trivia.currentTeamId ? teamById.get(room.trivia.currentTeamId)?.name ?? "Team" : "Team"
      return `${pickerName} من ${pickerTeam} يختار السؤال الآن.`
    }

    if (room.trivia.phase === "countdown") {
      return `السؤال سيظهر بعد ${countdownSeconds} ثوانٍ. جهّز البازر.`
    }

    if (room.trivia.phase === "buzzer_open") {
      return `البازر مفتوح للجميع لمدة ${buzzSeconds} ثانية.`
    }

    if (room.trivia.phase === "answer_active") {
      if (canAnswer) {
        return `${session.playerName}, this question is for you.`
      }
      const teamName = responderTeam?.name ?? "Team"
      const playerName = responderName ?? "Player"
      return `Question for ${playerName} from ${teamName}.`
    }

    if (room.trivia.phase === "answer_reveal" && room.trivia.lastResult) {
      if (room.trivia.lastResult.reason === "no_buzz") {
        return "لم يضغط أحد البازر. انتظر السؤال التالي."
      }
      if (room.trivia.lastResult.reason === "host_skip") {
        return "تم تخطي السؤال بواسطة المضيف."
      }
      return room.trivia.lastResult.wasCorrect ? "إجابة صحيحة." : "إجابة خاطئة."
    }

    return "بانتظار التحديث التالي."
  }, [buzzSeconds, canAnswer, countdownSeconds, playerNameById, responderName, responderTeam?.name, room, session, teamById])

  const submitBuzz = async () => {
    if (!session || busy || !canBuzz) {
      return
    }

    setBusy(true)
    setError(null)
    setNotice("تم إرسال إشارة البازر...")
    try {
      const ack = await sendAction(roomId, session.token, "player.input", { intent: "buzz" })
      setRoom(ack.payload.room)
      setNotice("تم تسجيل ضغطتك.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const submitAnswer = async (option: string) => {
    if (!session || !selectedQuestionId || busy) {
      return
    }

    const submitRequestId = makeRequestId()
    setBusy(true)
    setSubmittedQuestionId(selectedQuestionId)
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-4 py-7 text-white">
      {!session ? (
        <section className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <p className="text-sm text-slate-200">No local player session found for this room.</p>
          <p className="mt-2 text-sm text-slate-300">
            Join first via{" "}
            <Link className="text-cyan-300 underline" href={`/join/${roomId}`}>
              /join/{roomId}
            </Link>
            .
          </p>
          {error ? <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        </section>
      ) : (
        <article className={`rounded-3xl border p-5 ${activeTone.border} ${activeTone.bg}`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Controller</p>
          <h1 className="mt-2 text-2xl font-bold">{session.playerName}</h1>
          <p className="mt-1 text-sm text-slate-300">{myTeam ? `Team: ${myTeam.name}` : "بانتظار إسناد فريقك."}</p>

          <div className="mt-4 rounded-xl border border-white/20 bg-black/35 px-4 py-3">
            <p className={`text-base font-semibold ${activeTone.text}`}>{statusText}</p>
          </div>

          {selectedClue ? (
            <div className="mt-4 rounded-xl border border-white/20 bg-black/35 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                {selectedClue.categoryName} | {selectedClue.points} points
              </p>
              {isCountdownPhase ? (
                <div className="mt-3 rounded-xl border border-white/20 bg-black/30 p-4 text-center">
                  <p className="text-sm text-slate-200">استعد للبازر</p>
                  <p className="mt-1 text-7xl font-black leading-none text-amber-200 animate-pulse">
                    {countdownSeconds}
                  </p>
                </div>
              ) : null}
              {isQuestionRevealed ? <p className="mt-2 text-xl font-semibold leading-relaxed">{selectedClue.prompt}</p> : null}
            </div>
          ) : null}

          {canBuzz ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submitBuzz()}
              className="mt-5 h-20 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-xl font-black text-slate-950"
            >
              🔔 اضغط البازر الآن
            </Button>
          ) : null}

          {room?.trivia.phase === "answer_active" ? (
            <div className="mt-4 space-y-2">
              {canAnswer ? (
                <>
                  <p className={`text-sm font-semibold ${activeTone.text}`}>{session.playerName}, this question is for you.</p>
                  <p className="text-sm text-slate-300">الوقت المتبقي للإجابة: {answerSeconds} ثانية</p>
                  <div className="grid gap-2">
                    {(selectedClue?.options ?? []).map((optionText, index) => {
                      const option = optionLetter(index)
                      return (
                        <Button
                          key={option}
                          type="button"
                          variant="outline"
                          disabled={!canAnswer || busy}
                          onClick={() => void submitAnswer(option)}
                          className={`h-auto min-h-14 justify-start whitespace-normal py-3 text-right text-base ${activeTone.border} ${activeTone.bg}`}
                        >
                          <span className="font-semibold">{option}.</span>
                          <span className="mr-2">{optionText}</span>
                        </Button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-200">
                  {responderName ?? "Player"} من {responderTeam?.name ?? "Team"} يجيب الآن.
                </p>
              )}
            </div>
          ) : null}

          {room?.trivia.phase === "buzzer_open" ? (
            <p className="mt-4 text-sm text-slate-300">الوقت المتبقي للبازر: {buzzSeconds} ثانية</p>
          ) : null}

          {error ? <p className="mt-3 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          {notice ? <p className="mt-3 rounded-md bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">{notice}</p> : null}
        </article>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="outline" type="button" onClick={() => void hydrateState()} disabled={!session || busy}>
          Refresh
        </Button>
        <Button variant="ghost" type="button" onClick={clearSession} className="text-slate-300">
          Leave
        </Button>
      </div>
    </main>
  )
}
