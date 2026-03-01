"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { FeedbackOverlay, type FeedbackOverlayContext } from "@/components/ui/feedback-animations"
import { ThemeToggle } from "@/components/theme-toggle"
import { LiveApiError, getRoomState, makeRequestId, reconnectPlayer, sendAction } from "@/lib/client/live-api"
import { subscribeRoomStateStream } from "@/lib/client/live-stream"
import { clearPlayerSession, getPlayerSession, savePlayerSession, type PlayerSession } from "@/lib/client/live-session"
import type { RoomSnapshot } from "@/lib/server/types"

const CONTROLLER_POLL_IDLE_MS = 1500
const CONTROLLER_POLL_BOARD_MS = 850
const CONTROLLER_POLL_ACTIVE_MS = 280
const HEARTBEAT_MS = 10000
const CLOCK_TICK_MS = 300
const JOIN_CTA_GRADIENT_CLASS =
  "bg-gradient-to-r from-amber-400 via-pink-400 to-cyan-400 text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.32)]"
const CONTROLLER_ACTION_BUTTON_CLASS = `${JOIN_CTA_GRADIENT_CLASS} rounded-2xl border-0 font-black transition-all hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 disabled:hover:brightness-100`
const CONTROLLER_ROUND_ACTION_BUTTON_CLASS =
  "group relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-red-500 via-red-600 to-red-800 shadow-[inset_0_10px_20px_rgba(255,255,255,0.4),inset_0_-10px_20px_rgba(0,0,0,0.6),0_10px_25px_rgba(225,29,72,0.8)] transition-all duration-100 active:translate-y-3 active:scale-[0.98] active:shadow-[inset_0_20px_30px_rgba(0,0,0,0.7),0_0_10px_rgba(225,29,72,0.4)] disabled:opacity-50 disabled:pointer-events-none"

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
    border: "border-pink-300/50",
    text: "text-pink-100",
    bg: "bg-pink-500/18",
  },
  team_b: {
    border: "border-cyan-300/50",
    text: "text-cyan-100",
    bg: "bg-cyan-500/18",
  },
}

function toErrorMessage(error: unknown) {
  if (error instanceof LiveApiError) {
    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "خطأ غير معروف"
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

function isTerminalControllerSessionError(error: unknown) {
  if (!(error instanceof LiveApiError)) {
    return false
  }

  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return true
  }

  return (
    error.code === "UNAUTHORIZED" ||
    error.code === "FORBIDDEN" ||
    error.code === "ROOM_NOT_FOUND" ||
    error.code === "ROOM_NOT_ACTIVE" ||
    error.code === "ROOM_INACTIVE" ||
    error.code === "ROOM_TOKEN_MISMATCH" ||
    error.code === "PLAYER_NOT_FOUND"
  )
}

function isTerminalRoomState(state: RoomSnapshot["state"] | null | undefined) {
  return state === "session_completed" || state === "expired" || state === "superseded"
}

function getTeamTone(teamId: string | null | undefined): TeamTone {
  if (!teamId) {
    return {
      border: "border-glass-border",
      text: "text-foreground",
      bg: "bg-glass-bg",
    }
  }

  return (
    TEAM_TONES[teamId] ?? {
      border: "border-glass-border",
      text: "text-foreground",
      bg: "bg-glass-bg",
    }
  )
}

function remainingSeconds(targetTs: number | null, nowTs: number) {
  if (!targetTs) {
    return 0
  }
  return Math.max(0, Math.ceil((targetTs - nowTs) / 1000))
}

function isDocumentVisible() {
  if (typeof document === "undefined") {
    return true
  }

  return document.visibilityState === "visible"
}

function resolveControllerPollMs(room: RoomSnapshot | null) {
  if (!room) {
    return CONTROLLER_POLL_IDLE_MS
  }

  if (room.state !== "game_live") {
    return CONTROLLER_POLL_IDLE_MS
  }

  if (room.trivia.status === "in_progress") {
    if (room.trivia.phase === "board_turn") {
      return CONTROLLER_POLL_BOARD_MS
    }

    if (
      room.trivia.phase === "countdown" ||
      room.trivia.phase === "buzzer_open" ||
      room.trivia.phase === "answer_active" ||
      room.trivia.phase === "answer_reveal"
    ) {
      return CONTROLLER_POLL_ACTIVE_MS
    }

    return CONTROLLER_POLL_IDLE_MS
  }

  if (room.haraj.status === "in_progress") {
    if (room.haraj.phase === "haraj_collecting" || room.haraj.phase === "haraj_reveal") {
      return CONTROLLER_POLL_ACTIVE_MS
    }
    return CONTROLLER_POLL_BOARD_MS
  }

  return CONTROLLER_POLL_IDLE_MS
}

export default function ControllerClientPage({ roomId }: ControllerClientPageProps) {
  const [session, setSession] = useState<PlayerSession | null>(() => getPlayerSession(roomId))
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [isPageVisible, setIsPageVisible] = useState(() => isDocumentVisible())
  const [busy, setBusy] = useState(false)
  const [submittedQuestionId, setSubmittedQuestionId] = useState<string | null>(null)
  const [harajEstimateDraft, setHarajEstimateDraft] = useState("")
  const [submittedHarajRoundKey, setSubmittedHarajRoundKey] = useState<string | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<"correct" | "wrong" | null>(null)
  const [feedbackScoreDelta, setFeedbackScoreDelta] = useState<number | null>(null)
  const [feedbackContext, setFeedbackContext] = useState<FeedbackOverlayContext | null>(null)
  const [processedFeedbackQuestionId, setProcessedFeedbackQuestionId] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)
  const serverClockOffsetRef = useRef(0)
  const lastHarajRoundKeyRef = useRef<string | null>(null)

  const syncServerClock = useCallback((serverTs: number) => {
    const measuredOffset = serverTs - Date.now()
    serverClockOffsetRef.current = serverClockOffsetRef.current * 0.8 + measuredOffset * 0.2
  }, [])

  const terminateControllerSession = useCallback(
    (reason: unknown, message?: string) => {
      clearPlayerSession(roomId)
      setSession(null)
      setRoom(null)
      setSubmittedQuestionId(null)
      setBusy(false)
      if (message) {
        setNotice(message)
      } else {
        setNotice(null)
      }
      setError(toErrorMessage(reason))
    },
    [roomId]
  )

  useEffect(() => {
    const qId = room?.trivia?.selectedClue?.questionId
    if (room?.trivia?.phase === "answer_reveal" && room?.trivia.lastResult && qId && qId !== processedFeedbackQuestionId) {
      const { reason, wasCorrect } = room.trivia.lastResult
      if (reason !== "no_buzz" && reason !== "host_skip") {
        const responderPlayerId = room.trivia.currentResponderPlayerId
        const responderPlayerName = responderPlayerId
          ? room.players.find((player) => player.playerId === responderPlayerId)?.displayName ?? "لاعب"
          : "لاعب"
        const awardedTeamId = room.trivia.lastResult.awardedTeamId ?? room.trivia.currentResponderTeamId
        const awardedTeamName = awardedTeamId
          ? room.teams.find((team) => team.teamId === awardedTeamId)?.name ?? "فريق"
          : "فريق"

        setFeedbackState(wasCorrect ? "correct" : "wrong")
        setFeedbackScoreDelta(room.trivia.lastResult.awardedPoints)
        setFeedbackContext({
          playerName: responderPlayerName,
          teamName: awardedTeamName,
          points: room.trivia.lastResult.awardedPoints,
          reason,
        })
        setProcessedFeedbackQuestionId(qId)
      }
    }
    // Reset tracker when return to board
    if (room?.trivia?.phase === "board_turn") {
      setProcessedFeedbackQuestionId(null)
      setFeedbackState(null)
      setFeedbackScoreDelta(null)
      setFeedbackContext(null)
    }
  }, [processedFeedbackQuestionId, room])

  const hydrateState = useCallback(async () => {
    if (!session) {
      return
    }

    try {
      const response = await reconnectPlayer(roomId, session.token)
      if (isTerminalRoomState(response.room.state)) {
        terminateControllerSession(
          new LiveApiError(409, "ROOM_NOT_ACTIVE", "Room is no longer active"),
          "انتهت هذه الغرفة. يرجى الانضمام إلى غرفة جديدة."
        )
        return
      }
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
      if (isTerminalControllerSessionError(requestError)) {
        terminateControllerSession(requestError, "انتهت هذه الغرفة. يرجى الانضمام إلى غرفة جديدة.")
        return
      }
      setError(toErrorMessage(requestError))
    }
  }, [roomId, session, terminateControllerSession])

  const refreshState = useCallback(async () => {
    if (!session) {
      return
    }
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true

    try {
      const response = await getRoomState(roomId, session.token)
      syncServerClock(response.ts)
      if (isTerminalRoomState(response.payload.room.state)) {
        terminateControllerSession(
          new LiveApiError(409, "ROOM_NOT_ACTIVE", "Room is no longer active"),
          "تم إغلاق الغرفة. يرجى إعادة الانضمام."
        )
        return
      }
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      if (isTerminalControllerSessionError(requestError)) {
        terminateControllerSession(requestError, "تم إغلاق الغرفة. يرجى إعادة الانضمام.")
        return
      }
      setError(toErrorMessage(requestError))
    } finally {
      refreshInFlightRef.current = false
    }
  }, [roomId, session, syncServerClock, terminateControllerSession])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now() + serverClockOffsetRef.current)
    }, CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      setIsPageVisible(isDocumentVisible())
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
    }
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

  const controllerPollMs = resolveControllerPollMs(room)

  useEffect(() => {
    if (!session || !isPageVisible) {
      return
    }

    const unsubscribe = subscribeRoomStateStream({
      roomId,
      token: session.token,
      onError: (streamError) => {
        if (isTerminalControllerSessionError(streamError)) {
          terminateControllerSession(streamError, "تم إنهاء الغرفة الحالية. يرجى الانضمام إلى غرفة جديدة.")
          return
        }
        setError(toErrorMessage(streamError))
      },
      onState: (envelope) => {
        syncServerClock(envelope.ts)
        if (isTerminalRoomState(envelope.payload.room.state)) {
          terminateControllerSession(
            new LiveApiError(409, "ROOM_NOT_ACTIVE", "Room is no longer active"),
            "تم إنهاء الغرفة الحالية. يرجى الانضمام إلى غرفة جديدة."
          )
          return
        }
        setRoom(envelope.payload.room)
        setError(null)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [isPageVisible, roomId, session, syncServerClock, terminateControllerSession])

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false
    let timer: number | null = null

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(async () => {
        if (cancelled) {
          return
        }

        if (isPageVisible) {
          await refreshState()
        }

        if (!cancelled) {
          schedule(controllerPollMs)
        }
      }, delayMs)
    }

    schedule(0)

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [controllerPollMs, isPageVisible, refreshState, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const timer = window.setInterval(() => {
      if (!isPageVisible) {
        return
      }
      void sendAction(roomId, session.token, "player.heartbeat")
        .then((ack) => {
          syncServerClock(ack.ts)
        })
        .catch((requestError) => {
          if (isTerminalControllerSessionError(requestError)) {
            terminateControllerSession(requestError, "تم إغلاق الغرفة. يرجى الانضمام إلى غرفة جديدة.")
            return
          }
          // Ignore transient heartbeat failures.
        })
    }, HEARTBEAT_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [isPageVisible, roomId, session, syncServerClock, terminateControllerSession])

  const selectedQuestionId = room?.trivia.selectedClue?.questionId ?? null
  const harajRoundKey =
    room?.haraj.status === "in_progress" ? `${room.haraj.roundIndex}:${room.haraj.currentProduct?.productId ?? "none"}` : null
  useEffect(() => {
    if (selectedQuestionId !== submittedQuestionId) {
      setSubmittedQuestionId(null)
    }
  }, [selectedQuestionId, submittedQuestionId])

  useEffect(() => {
    if (harajRoundKey !== lastHarajRoundKeyRef.current) {
      lastHarajRoundKeyRef.current = harajRoundKey
      setSubmittedHarajRoundKey(null)
      setHarajEstimateDraft("")
    }
  }, [harajRoundKey])

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
  const responderName = responderId ? playerNameById.get(responderId) ?? "لاعب" : null
  const responderTeam = responderTeamId ? teamById.get(responderTeamId) ?? null : null
  const activeTone = getTeamTone(responderTeamId ?? myTeamId)

  const canBuzz = useMemo(() => {
    if (!room || !session) {
      return false
    }
    return (
      room.state === "game_live" &&
      room.trivia.status === "in_progress" &&
      room.trivia.phase === "buzzer_open" &&
      !room.trivia.currentResponderPlayerId
    )
  }, [room, session])

  const canAnswer = useMemo(() => {
    if (!room || !session || !selectedQuestionId) {
      return false
    }
    if (room.state !== "game_live" || room.trivia.status !== "in_progress" || room.trivia.phase !== "answer_active") {
      return false
    }
    if (room.trivia.currentResponderPlayerId !== session.playerId) {
      return false
    }
    return submittedQuestionId !== selectedQuestionId
  }, [room, session, selectedQuestionId, submittedQuestionId])

  const hasSubmittedHarajEstimate = Boolean(
    (session && room?.haraj.submittedPlayerIds.includes(session.playerId)) ||
      (harajRoundKey && submittedHarajRoundKey === harajRoundKey)
  )

  const canSubmitHarajEstimate = useMemo(() => {
    if (!room || !session) {
      return false
    }
    return (
      room.state === "game_live" &&
      room.haraj.status === "in_progress" &&
      room.haraj.phase === "haraj_collecting" &&
      Boolean(myTeamId) &&
      !hasSubmittedHarajEstimate
    )
  }, [hasSubmittedHarajEstimate, myTeamId, room, session])

  const countdownSeconds = remainingSeconds(room?.trivia.countdownEndsAt ?? null, nowTs)
  const buzzSeconds = remainingSeconds(room?.trivia.buzzEndsAt ?? null, nowTs)
  const answerSeconds = remainingSeconds(room?.trivia.answerEndsAt ?? null, nowTs)
  const harajCollectSeconds = remainingSeconds(room?.haraj.collectEndsAt ?? null, nowTs)
  const selectedClue = room?.trivia.selectedClue ?? null
  const isCountdownPhase = room?.trivia.phase === "countdown"
  const isQuestionRevealed =
    room?.trivia.phase === "buzzer_open" || room?.trivia.phase === "answer_active" || room?.trivia.phase === "answer_reveal"

  const statusText = useMemo(() => {
    if (!room || !session) {
      return "بانتظار بدء اللعبة من شاشة المضيف."
    }

    if (room.haraj.status === "in_progress") {
      if (room.haraj.phase === "haraj_collecting") {
        if (hasSubmittedHarajEstimate) {
          return "تم إرسال تخمينك. انتظر كشف السعر الحقيقي."
        }
        return `احزر السعر الآن. الوقت المتبقي ${harajCollectSeconds} ثانية.`
      }

      if (room.haraj.phase === "haraj_reveal") {
        return "تم كشف السعر الحقيقي ونتائج الجولة."
      }

      return "بانتظار انطلاق جولة الحراج."
    }

    if (room.trivia.status !== "in_progress") {
      return "بانتظار بدء اللعبة من شاشة المضيف."
    }

    if (room.state === "paused_wait_host") {
      return "تم إيقاف الجلسة مؤقتًا بسبب عدم نشاط المضيف. انتظر استئناف الجلسة."
    }

    if (room.trivia.phase === "board_turn") {
      const pickerName = room.trivia.currentPickerPlayerId
        ? playerNameById.get(room.trivia.currentPickerPlayerId) ?? "لاعب"
        : "لاعب"
      const pickerTeam = room.trivia.currentTeamId ? teamById.get(room.trivia.currentTeamId)?.name ?? "فريق" : "فريق"
      return `${pickerName} من ${pickerTeam} يختار السؤال الآن.`
    }

    if (room.trivia.phase === "countdown") {
      return `السؤال سيظهر بعد ${countdownSeconds} ثوانٍ. جهّز البازر.`
    }

    if (room.trivia.phase === "buzzer_open") {
      return null
    }

    if (room.trivia.phase === "answer_active") {
      if (canAnswer) {
        return `هذا السؤال لك يا ${session.playerName}.`
      }
      const teamName = responderTeam?.name ?? "فريق"
      const playerName = responderName ?? "لاعب"
      return `السؤال للاعب ${playerName} من ${teamName}.`
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
  }, [
    canAnswer,
    countdownSeconds,
    harajCollectSeconds,
    hasSubmittedHarajEstimate,
    playerNameById,
    responderName,
    responderTeam?.name,
    room,
    session,
    teamById,
  ])

  const submitBuzz = async () => {
    if (!session || busy || !canBuzz) {
      return
    }

    setBusy(true)
    setError(null)
    setNotice("تم إرسال إشارة البازر...")
    try {
      const ack = await sendAction(roomId, session.token, "player.input", { intent: "buzz" })
      syncServerClock(ack.ts)
      setRoom(ack.payload.room)
      setNotice("تم تسجيل ضغطتك.")
    } catch (requestError) {
      if (isTerminalControllerSessionError(requestError)) {
        terminateControllerSession(requestError, "تم إغلاق الغرفة. يرجى الانضمام إلى غرفة جديدة.")
        return
      }
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const submitAnswer = async (option: string) => {
    if (!session || !selectedQuestionId || busy || !canAnswer) {
      return
    }

    const submitRequestId = makeRequestId()
    setBusy(true)
    setSubmittedQuestionId(selectedQuestionId)
    setError(null)
    setNotice(`جاري إرسال الإجابة: ${option}...`)

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

      syncServerClock(ack.ts)
      setRoom(ack.payload.room)
      setNotice(`تم إرسال الإجابة: ${option}`)
    } catch (requestError) {
      setSubmittedQuestionId(null)
      if (isTerminalControllerSessionError(requestError)) {
        terminateControllerSession(requestError, "تم إغلاق الغرفة. يرجى الانضمام إلى غرفة جديدة.")
        return
      }
      if (
        requestError instanceof LiveApiError &&
        (requestError.code === "INVALID_STATE_TRANSITION" || requestError.code === "TRIVIA_INVALID_RESPONDER")
      ) {
        setNotice("تم تغيير حالة السؤال قبل إرسال الإجابة. جارٍ مزامنة الحالة...")
        await refreshState()
      }
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const submitHarajEstimate = async () => {
    if (!session || !room || busy || !canSubmitHarajEstimate || !harajRoundKey) {
      return
    }

    const estimate = Number(harajEstimateDraft.trim())
    if (!Number.isFinite(estimate) || estimate < 0) {
      setError("أدخل رقمًا صحيحًا للتخمين.")
      return
    }

    setBusy(true)
    setError(null)
    setNotice("جاري إرسال التخمين...")

    try {
      const ack = await sendAction(roomId, session.token, "player.submitHarajEstimate", { estimate })
      syncServerClock(ack.ts)
      setRoom(ack.payload.room)
      setSubmittedHarajRoundKey(harajRoundKey)
      setNotice("تم إرسال التخمين بنجاح.")
    } catch (requestError) {
      if (isTerminalControllerSessionError(requestError)) {
        terminateControllerSession(requestError, "تم إغلاق الغرفة. يرجى الانضمام إلى غرفة جديدة.")
        return
      }
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <div className="party-stage-bg" />
      <div className="party-stage-grid" />
      <div className="pointer-events-none fixed -left-24 top-16 h-64 w-64 rounded-full bg-pink-400/30 blur-3xl" />
      <div className="pointer-events-none fixed -right-20 top-56 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" />
      <FeedbackOverlay
        currentStatus={feedbackState}
        scoreDelta={feedbackState ? feedbackScoreDelta : null}
        context={feedbackState ? feedbackContext : null}
        showStickers={false}
        onComplete={() => {
          setFeedbackState(null)
          setFeedbackScoreDelta(null)
          setFeedbackContext(null)
        }}
      />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-2xl px-4 py-7 sm:py-9">
        <div className="mb-4 flex items-center justify-between">
          <p className="party-chip px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/90">
            Controller
          </p>
          <ThemeToggle />
        </div>

        {!session ? (
          <section className="party-surface-strong rounded-3xl p-6">
            <h1 className="text-2xl font-black">لا يوجد اتصال لاعب محفوظ</h1>
            <p className="mt-2 text-sm text-slate-200">ابدأ الانضمام أولًا ثم ارجع لوحدة التحكم.</p>
            <p className="mt-3 text-sm text-slate-300">
              ابدأ الانضمام عبر{" "}
              <Link className="font-semibold text-cyan-300 underline" href={`/join/${roomId}`}>
                /join/{roomId}
              </Link>
              .
            </p>
            {error ? <p className="party-status-error mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</p> : null}
          </section>
        ) : (
          <article className={`party-surface-strong rounded-4xl border p-6 sm:p-7 ${activeTone.border} ${activeTone.bg}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div>
                <h1 className="text-3xl font-black">{session.playerName}</h1>
                <p className="mt-1 text-sm text-slate-200">{myTeam ? `فريق: ${myTeam.name}` : "بانتظار إسناد فريقك."}</p>
              </div>
            </div>

            {statusText ? (
              <div className="mt-5 rounded-2xl border border-white/20 bg-black/25 px-4 py-4 shadow-inner">
                <p className={`text-base font-semibold leading-relaxed ${activeTone.text}`}>{statusText}</p>
              </div>
            ) : null}

            {room?.haraj.status === "in_progress" && room.haraj.phase === "haraj_collecting" && room.haraj.currentProduct ? (
              <div className="mt-5 space-y-4 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                  جولة {room.haraj.roundIndex + 1} من {room.haraj.totalRounds}
                </p>
                <h2 className="text-2xl font-black">{room.haraj.currentProduct.name}</h2>
                <div className="overflow-hidden rounded-2xl border border-white/20 bg-black/30">
                  <img
                    src={room.haraj.currentProduct.imageUrl}
                    alt={room.haraj.currentProduct.name}
                    className="h-56 w-full object-cover"
                  />
                </div>
                <p className="text-sm text-slate-200">
                  الوقت المتبقي: <span className="font-black text-amber-300">{harajCollectSeconds}</span> ثانية
                </p>
                {hasSubmittedHarajEstimate ? (
                  <p className="rounded-xl border border-emerald-300/40 bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-100">
                    تم إرسال التخمين ✅
                  </p>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-200">تخمينك للسعر ({room.haraj.currentProduct.currency})</label>
                    <input
                      type="number"
                      min={0}
                      value={harajEstimateDraft}
                      onChange={(event) => setHarajEstimateDraft(event.target.value)}
                      className="h-12 w-full rounded-xl border border-white/20 bg-black/25 px-3 text-lg font-bold text-white outline-none focus:ring-2 focus:ring-cyan-400/45"
                      placeholder="مثال: 499"
                    />
                    <Button
                      type="button"
                      disabled={busy || !canSubmitHarajEstimate}
                      onClick={() => void submitHarajEstimate()}
                      className={`${CONTROLLER_ACTION_BUTTON_CLASS} h-12 w-full text-base`}
                    >
                      إرسال التخمين
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {room?.haraj.status === "in_progress" && room.haraj.phase === "haraj_reveal" && room.haraj.lastReveal ? (
              <div className="mt-5 space-y-4 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300">كشف النتائج</p>
                <h2 className="text-2xl font-black">{room.haraj.lastReveal.productName}</h2>
                <p className="text-base text-slate-100">
                  السعر الحقيقي:{" "}
                  <span className="font-black text-amber-300">
                    {room.haraj.lastReveal.actualPrice} {room.haraj.lastReveal.currency}
                  </span>
                </p>
                {room.haraj.lastReveal.skipped ? (
                  <p className="rounded-xl border border-amber-300/40 bg-amber-500/12 px-4 py-3 text-sm font-semibold text-amber-100">
                    لم يرسل أي لاعب تخمينًا في هذه الجولة.
                  </p>
                ) : (
                  (() => {
                    const myResult = room.haraj.lastReveal?.results.find((entry) => entry.playerId === session.playerId) ?? null
                    if (!myResult) {
                      return (
                        <p className="rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-sm text-slate-200">
                          لم يتم احتساب نتيجة لك في هذه الجولة.
                        </p>
                      )
                    }

                    return (
                      <div className="rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-sm text-slate-100">
                        <p>تخمينك: {myResult.estimate}</p>
                        <p>الفارق: {myResult.difference}</p>
                        <p>الترتيب: {myResult.rank ?? "-"}</p>
                        <p className="font-black text-amber-200">النقاط المكتسبة: {myResult.pointsAwarded}</p>
                      </div>
                    )
                  })()
                )}
              </div>
            ) : null}

            {room?.haraj.status !== "in_progress" && selectedClue ? (
              <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                  {selectedClue.categoryName} | {selectedClue.points} points
                </p>
                {isCountdownPhase ? (
                  <div className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-500/12 p-4 text-center">
                    <p className="text-sm text-amber-100">استعد للبازر</p>
                    <p className="mt-1 text-7xl font-black leading-none text-amber-300 animate-pulse">
                      {countdownSeconds}
                    </p>
                  </div>
                ) : null}
                {isQuestionRevealed ? (
                  <p className="mt-3 text-xl font-semibold leading-relaxed text-white">{selectedClue.prompt}</p>
                ) : null}
              </div>
            ) : null}
            {room?.haraj.status !== "in_progress" && canBuzz ? (
              <div className="mt-8 mb-4 flex justify-center">
                {/* Buzzer Base */}
                <div className="relative flex h-[12rem] w-[12rem] sm:h-[16rem] sm:w-[16rem] items-center justify-center rounded-full bg-gradient-to-b from-slate-700 to-slate-950 p-3 sm:p-5 shadow-[0_15px_25px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.2)] ring-2 sm:ring-4 ring-slate-900">
                  {/* The Button */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitBuzz()}
                    className={CONTROLLER_ROUND_ACTION_BUTTON_CLASS}
                    style={{ WebkitTapHighlightColor: "transparent", WebkitUserSelect: "none" }}
                  >
                    {/* Top glare for domed 3D plastic effect */}
                    <div className="pointer-events-none absolute left-1/2 top-4 h-[35%] w-[65%] -translate-x-1/2 rounded-[100%] bg-gradient-to-b from-white/40 to-transparent blur-[2px]" />
                    <span className="relative z-10 -translate-y-1 text-4xl sm:text-6xl font-black uppercase text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
                      جاوب
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {room?.haraj.status !== "in_progress" && room?.trivia.phase === "answer_active" ? (
              <div className="mt-5 space-y-3">
                {canAnswer ? (
                  <>
                    <p className={`rounded-xl border px-4 py-2 text-sm font-semibold ${activeTone.border} ${activeTone.bg}`}>
                      هذا السؤال لك يا {session.playerName}.
                    </p>
                    <p className="text-sm text-slate-200">الوقت المتبقي للإجابة: {answerSeconds} ثانية</p>
                    <div className="grid gap-2.5">
                      {(selectedClue?.options ?? []).map((optionText, index) => {
                        const option = optionLetter(index)
                        return (
                          <Button
                            key={option}
                            type="button"
                            disabled={!canAnswer || busy}
                            onClick={() => void submitAnswer(option)}
                            className={`${CONTROLLER_ACTION_BUTTON_CLASS} h-auto min-h-14 justify-start px-4 py-3 text-right text-base`}
                          >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-sm font-black">
                              {option}
                            </span>
                            <span className="mr-3">{optionText}</span>
                          </Button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-slate-100">
                    {responderName ?? "لاعب"} من {responderTeam?.name ?? "فريق"} يجيب الآن.
                  </p>
                )}
              </div>
            ) : null}

            {room?.haraj.status !== "in_progress" && room?.trivia.phase === "buzzer_open" ? (
              <div className="mt-5 rounded-2xl border border-rose-300/45 bg-rose-500/18 px-4 py-5 text-center shadow-[0_0_30px_rgba(244,63,94,0.18)]">
                <p className="text-sm font-bold tracking-wide text-rose-100 sm:text-base">الوقت المتبقي</p>
                <p className="mt-2 text-7xl font-black leading-none text-amber-200 tabular-nums sm:text-8xl">{buzzSeconds}</p>
                <p className="mt-1 text-sm font-semibold text-rose-100/90">ثانية</p>
              </div>
            ) : null}

            {error ? <p className="party-status-error mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</p> : null}
            {notice ? <p className="party-status-success mt-4 rounded-xl px-4 py-3 text-sm font-medium">{notice}</p> : null}
          </article>
        )}

      </main>
    </div>
  )
}
