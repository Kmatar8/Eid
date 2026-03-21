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

function normalizeEasternArabicDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
}

function parseHarajEstimateInput(value: string): number | null {
  const normalized = normalizeEasternArabicDigits(value.trim())
    .replace(/٫/g, ".")
    .replace(/[٬،,]/g, "")
    .replace(/\s+/g, "")
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
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

  if (room.activeGame === "trivia" && room.trivia.status === "in_progress") {
    if (room.trivia.phase === "board_turn") {
      return CONTROLLER_POLL_BOARD_MS
    }

    if (
      room.trivia.phase === "countdown" ||
      room.trivia.phase === "answer_active" ||
      room.trivia.phase === "answer_reveal"
    ) {
      return CONTROLLER_POLL_ACTIVE_MS
    }

    return CONTROLLER_POLL_IDLE_MS
  }

  if (room.activeGame === "haraj" && room.haraj.status === "in_progress") {
    if (room.haraj.phase === "haraj_collecting" || room.haraj.phase === "haraj_reveal") {
      return CONTROLLER_POLL_ACTIVE_MS
    }
    return CONTROLLER_POLL_BOARD_MS
  }

  if (room.trivia.status === "in_progress") {
    if (room.trivia.phase === "board_turn") {
      return CONTROLLER_POLL_BOARD_MS
    }
    if (
      room.trivia.phase === "countdown" ||
      room.trivia.phase === "answer_active" ||
      room.trivia.phase === "answer_reveal"
    ) {
      return CONTROLLER_POLL_ACTIVE_MS
    }
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
  const isTriviaActiveGame = room?.activeGame === "trivia" && room?.trivia.status === "in_progress"
  const isHarajActiveGame = room?.activeGame === "haraj" && room?.haraj.status === "in_progress"

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
    if (
      isTriviaActiveGame &&
      room?.trivia?.phase === "answer_reveal" &&
      room?.trivia.lastResult &&
      qId &&
      qId !== processedFeedbackQuestionId
    ) {
      const { reason, wasCorrect } = room.trivia.lastResult
      if (reason !== "host_skip") {
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
    if (isTriviaActiveGame && room?.trivia?.phase === "board_turn") {
      setProcessedFeedbackQuestionId(null)
      setFeedbackState(null)
      setFeedbackScoreDelta(null)
      setFeedbackContext(null)
    }
  }, [isTriviaActiveGame, processedFeedbackQuestionId, room])

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

  const selectedQuestionId = isTriviaActiveGame ? room?.trivia.selectedClue?.questionId ?? null : null
  const harajRoundKey =
    isHarajActiveGame ? `${room.haraj.roundIndex}:${room.haraj.currentProduct?.productId ?? "none"}` : null
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
  const isStealTurn =
    Boolean(room?.trivia.currentTeamId) &&
    Boolean(responderTeamId) &&
    room?.trivia.currentTeamId !== responderTeamId

  const canAnswer = useMemo(() => {
    if (!room || !session || !selectedQuestionId) {
      return false
    }
    if (
      room.state !== "game_live" ||
      room.activeGame !== "trivia" ||
      room.trivia.status !== "in_progress" ||
      room.trivia.phase !== "answer_active"
    ) {
      return false
    }
    if (room.trivia.currentResponderPlayerId !== session.playerId) {
      return false
    }
    return submittedQuestionId !== selectedQuestionId
  }, [room, session, selectedQuestionId, submittedQuestionId])

  const hasSubmittedHarajEstimate = Boolean(
    (session && isHarajActiveGame && room?.haraj.submittedPlayerIds.includes(session.playerId)) ||
      (harajRoundKey && submittedHarajRoundKey === harajRoundKey)
  )

  const canSubmitHarajEstimate = useMemo(() => {
    if (!room || !session) {
      return false
    }
    return (
      room.state === "game_live" &&
      room.activeGame === "haraj" &&
      room.haraj.status === "in_progress" &&
      room.haraj.phase === "haraj_collecting" &&
      Boolean(myTeamId) &&
      !hasSubmittedHarajEstimate
    )
  }, [hasSubmittedHarajEstimate, myTeamId, room, session])

  const countdownSeconds = remainingSeconds(room?.trivia.countdownEndsAt ?? null, nowTs)
  const answerSeconds = remainingSeconds(room?.trivia.answerEndsAt ?? null, nowTs)
  const harajCollectSeconds = remainingSeconds(room?.haraj.collectEndsAt ?? null, nowTs)
  const selectedClue = isTriviaActiveGame ? room?.trivia.selectedClue ?? null : null
  const isCountdownPhase = isTriviaActiveGame && room?.trivia.phase === "countdown"
  const isQuestionRevealed = isTriviaActiveGame && (room?.trivia.phase === "answer_active" || room?.trivia.phase === "answer_reveal")

  const statusText = useMemo(() => {
    if (!room || !session) {
      return "بانتظار بدء اللعبة من شاشة المضيف."
    }

    if (room.state === "paused_wait_host") {
      return "تم إيقاف الجلسة مؤقتًا بسبب عدم نشاط المضيف. انتظر استئناف الجلسة."
    }

    if (isHarajActiveGame) {
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

    if (!isTriviaActiveGame) {
      return "بانتظار بدء اللعبة من شاشة المضيف."
    }

    if (room.trivia.phase === "board_turn") {
      const pickerName = room.trivia.currentPickerPlayerId
        ? playerNameById.get(room.trivia.currentPickerPlayerId) ?? "لاعب"
        : "لاعب"
      const pickerTeam = room.trivia.currentTeamId ? teamById.get(room.trivia.currentTeamId)?.name ?? "فريق" : "فريق"
      return `${pickerName} من ${pickerTeam} يختار السؤال الآن.`
    }

    if (room.trivia.phase === "countdown") {
      return `السؤال سيظهر بعد ${countdownSeconds} ثوانٍ. استعد لدور اللاعب المكلّف بالإجابة.`
    }

    if (room.trivia.phase === "answer_active") {
      if (canAnswer) {
        return `هذا السؤال لك يا ${session.playerName}.`
      }
      const teamName = responderTeam?.name ?? "فريق"
      const playerName = responderName ?? "لاعب"
      return isStealTurn
        ? `فرصة السرقة الآن للاعب ${playerName} من ${teamName}.`
        : `السؤال للاعب ${playerName} من ${teamName}.`
    }

    if (room.trivia.phase === "answer_reveal" && room.trivia.lastResult) {
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
    isStealTurn,
    isHarajActiveGame,
    isTriviaActiveGame,
  ])

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

    const estimate = parseHarajEstimateInput(harajEstimateDraft)
    if (estimate === null || estimate < 0) {
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

            {isHarajActiveGame && room?.haraj.phase === "haraj_collecting" && room.haraj.currentProduct ? (
              <div className="mt-5 space-y-4 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                  جولة {room.haraj.roundIndex + 1} من {room.haraj.totalRounds}
                </p>
                <p className="text-sm text-slate-200">أدخل قيمة المنتج فقط قبل انتهاء الدقيقة الحالية.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-amber-300/40 bg-amber-500/12 p-4 text-center shadow-inner">
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-100">Time Remaining</p>
                    <p className="mt-2 text-sm font-semibold text-amber-50">الوقت المتبقي</p>
                    <p className="mt-3 text-6xl font-black leading-none text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.35)]">
                      {harajCollectSeconds}
                    </p>
                    <p className="mt-2 text-sm text-amber-50/90">ثانية</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/35 bg-cyan-500/12 p-4 text-center shadow-inner">
                    <p className="text-xs uppercase tracking-[0.22em] text-cyan-100">Submissions</p>
                    <p className="mt-2 text-sm font-semibold text-cyan-50">حالة الإرسال</p>
                    <p className="mt-3 text-5xl font-black leading-none text-cyan-200">
                      {room.haraj.roundSubmittedCount}/{room.haraj.roundEligiblePlayers}
                    </p>
                    <p className="mt-2 text-xs text-cyan-50/90">
                      {hasSubmittedHarajEstimate ? "تم حفظ تخمينك" : "أرسل قبل انتهاء الوقت"}
                    </p>
                  </div>
                </div>
                {hasSubmittedHarajEstimate ? (
                  <p className="rounded-xl border border-emerald-300/40 bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-100">
                    تم إرسال التخمين ✅
                  </p>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-200">قيمة المنتج ({room.haraj.currentProduct.currency})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={harajEstimateDraft}
                      onChange={(event) => setHarajEstimateDraft(event.target.value)}
                      className="h-12 w-full rounded-xl border border-white/20 bg-black/25 px-3 text-lg font-bold text-white outline-none focus:ring-2 focus:ring-cyan-400/45"
                      placeholder="مثال: 499 أو ٤٩٩"
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

            {isHarajActiveGame && room?.haraj.phase === "haraj_reveal" && room.haraj.lastReveal ? (
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

            {isTriviaActiveGame && selectedClue ? (
              <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                  {selectedClue.categoryName} | {selectedClue.points} points
                </p>
                {isCountdownPhase ? (
                  <div className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-500/12 p-4 text-center">
                    <p className="text-sm text-amber-100">استعد للإجابة المخصّصة</p>
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

            {isTriviaActiveGame && room?.trivia.phase === "answer_active" ? (
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
                    {isStealTurn ? "فرصة السرقة الآن: " : ""}
                    {responderName ?? "لاعب"} من {responderTeam?.name ?? "فريق"} يجيب الآن.
                  </p>
                )}
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
