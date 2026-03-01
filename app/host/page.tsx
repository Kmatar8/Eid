"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { AnimatePresence, motion } from "framer-motion"
import { LogOut, Plus, Power, X } from "lucide-react"
import FireworksBackgroundDemo from "@/components/fireworks-demo"
import { Button } from "@/components/ui/button"
import { FireworksBackground } from "@/components/ui/fireworks"
import { FeedbackOverlay, type FeedbackOverlayContext } from "@/components/ui/feedback-animations"
import { BorderBeam } from "@/components/ui/border-beam"
import confetti from "canvas-confetti"
import { AvatarGroup, AvatarGroupTooltip } from "@/components/animate-ui/components/animate/avatar-group"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LiveApiError, createRoom, getRoomState, sendAction } from "@/lib/client/live-api"
import { subscribeRoomStateStream } from "@/lib/client/live-stream"
import {
  clearHostRoomId,
  clearHostSession,
  getHostRoomId,
  getHostToken,
  setHostRoomId,
} from "@/lib/client/live-session"
import type { HostActionType } from "@/lib/server/protocol-v1"
import type { RoomSnapshot } from "@/lib/server/types"

const HOST_POLL_IDLE_MS = 1700
const HOST_POLL_BOARD_MS = 850
const HOST_POLL_ACTIVE_MS = 260
const CLOCK_TICK_MS = 300
const HOST_HEARTBEAT_MS = 10000
const OPTION_LETTERS = ["A", "B", "C", "D"] as const
const JOIN_CTA_GRADIENT_CLASS =
  "bg-gradient-to-r from-amber-400 via-pink-400 to-cyan-400 text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.32)]"
const HOST_ACTION_BUTTON_CLASS = `${JOIN_CTA_GRADIENT_CLASS} rounded-xl font-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100`
const HOST_END_ICON_BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full border border-red-300/35 bg-red-500/22 text-red-100 shadow-lg transition hover:scale-105 hover:bg-red-500/34 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-red-500/22"
const HOST_LOGOUT_ICON_BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/12 text-slate-100 shadow-lg transition hover:scale-105 hover:bg-white/20 active:scale-95"

type FeedbackType = "correct" | "wrong" | null
type HostStage = "lobby" | "overview" | "trivia" | "celebration" | "paused"

type TeamTone = {
  border: string
  text: string
  bg: string
  chip: string
}

const TEAM_TONES: Record<string, TeamTone> = {
  team_a: {
    border: "border-pink-300/50",
    text: "text-pink-100",
    bg: "bg-pink-500/18",
    chip: "bg-pink-500/20 text-pink-100 border-pink-300/40",
  },
  team_b: {
    border: "border-cyan-300/50",
    text: "text-cyan-100",
    bg: "bg-cyan-500/18",
    chip: "bg-cyan-500/20 text-cyan-100 border-cyan-300/40",
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

function isInvalidTransitionAt(error: unknown, allowedStates: string[]) {
  if (!(error instanceof LiveApiError)) {
    return false
  }

  if (error.code !== "INVALID_STATE_TRANSITION") {
    return false
  }

  const state = typeof error.details?.state === "string" ? error.details.state : null
  return state ? allowedStates.includes(state) : false
}

function isFatalHostSessionError(error: unknown) {
  if (!(error instanceof LiveApiError)) {
    return false
  }

  return (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    error.code === "UNAUTHORIZED" ||
    error.code === "FORBIDDEN" ||
    error.code === "ROOM_NOT_FOUND" ||
    error.code === "HOST_ROOM_MISMATCH"
  )
}

function isTerminalRoomState(state: RoomSnapshot["state"] | null | undefined) {
  return state === "session_completed" || state === "expired" || state === "superseded"
}

function getTeamTone(teamId: string | null | undefined): TeamTone {
  if (!teamId) {
    return {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/10",
      chip: "bg-white/10 text-slate-100 border-white/20",
    }
  }

  return (
    TEAM_TONES[teamId] ?? {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/10",
      chip: "bg-white/10 text-slate-100 border-white/20",
    }
  )
}

function isDefaultTeamName(teamId: string, name: string) {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (teamId === "team_a") {
    return normalized === "team a" || normalized === "اسم الفريق"
  }

  if (teamId === "team_b") {
    return normalized === "team b" || normalized === "اسم الفريق"
  }

  return false
}

function getTeamColorLabel(teamId: string) {
  if (teamId === "team_a") {
    return "الوردي"
  }

  if (teamId === "team_b") {
    return "السماوي"
  }

  return "الفريق"
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

function resolveHostPollMs(room: RoomSnapshot | null) {
  if (!room) {
    return HOST_POLL_IDLE_MS
  }

  if (room.state !== "game_live" || room.trivia.status !== "in_progress") {
    return HOST_POLL_IDLE_MS
  }

  if (room.trivia.phase === "board_turn") {
    return HOST_POLL_BOARD_MS
  }

  if (
    room.trivia.phase === "countdown" ||
    room.trivia.phase === "buzzer_open" ||
    room.trivia.phase === "answer_active" ||
    room.trivia.phase === "answer_reveal"
  ) {
    return HOST_POLL_ACTIVE_MS
  }

  return HOST_POLL_IDLE_MS
}

function getHostActionGuardError(room: RoomSnapshot | null, action: HostActionType): string | null {
  if (!room) {
    return "لم يتم تحميل حالة الغرفة بعد."
  }

  if (isTerminalRoomState(room.state)) {
    return "تم إنهاء هذه الغرفة ولا يمكن تنفيذ أوامر جديدة."
  }

  if (
    room.state === "paused_wait_host" &&
    action !== "host.resumeSession" &&
    action !== "host.endSession" &&
    action !== "host.heartbeat"
  ) {
    return "الجلسة متوقفة. اضغط استئناف الجلسة أولًا."
  }

  if (action === "host.assignPlayerTeam" || action === "host.renameTeam") {
    return room.state === "lobby_open" || room.state === "lobby_locked" || room.state === "teams_ready"
      ? null
      : "تعديل الفرق متاح فقط قبل بدء اللعب."
  }

  if (action === "host.lockLobby") {
    return room.state === "lobby_open" ? null : "لا يمكن قفل اللوبي في الحالة الحالية."
  }

  if (action === "host.startTeams") {
    return room.state === "lobby_locked" ? null : "ابدأ توزيع الفرق بعد قفل اللوبي."
  }

  if (action === "host.startTrivia") {
    return room.state === "teams_ready" || room.state === "between_games"
      ? null
      : "بدء اللعبة متاح فقط بعد تجهيز الفرق."
  }

  if (action === "host.selectTriviaClue") {
    return room.state === "game_live" && room.trivia.status === "in_progress" && room.trivia.phase === "board_turn"
      ? null
      : "اختيار السؤال متاح فقط أثناء دور اختيار اللوحة."
  }

  if (action === "host.selectAnotherResponder") {
    return room.state === "game_live" &&
      room.trivia.status === "in_progress" &&
      (room.trivia.phase === "board_turn" || room.trivia.phase === "answer_active")
      ? null
      : "تبديل اللاعب متاح فقط أثناء دور الاختيار أو الإجابة."
  }

  if (action === "host.nextQuestion") {
    return room.state === "game_live" &&
      room.trivia.status === "in_progress" &&
      (room.trivia.phase === "answer_reveal" ||
        room.trivia.phase === "countdown" ||
        room.trivia.phase === "buzzer_open" ||
        room.trivia.phase === "answer_active")
      ? null
      : "الانتقال للسؤال التالي غير متاح في هذه المرحلة."
  }

  if (action === "host.resumeSession") {
    return room.state === "paused_wait_host" ? null : "الجلسة ليست في وضع الإيقاف المؤقت."
  }

  return null
}

export default function HostStagePage() {
  const router = useRouter()

  const [hostToken, setHostTokenState] = useState<string | null>(() => getHostToken())
  const [roomId, setRoomId] = useState<string | null>(() => getHostRoomId())
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [isPageVisible, setIsPageVisible] = useState(() => isDocumentVisible())
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [isBootstrappingRoom, setIsBootstrappingRoom] = useState(false)
  const [bootstrapBlocked, setBootstrapBlocked] = useState(false)
  const [teamPickerPlayerId, setTeamPickerPlayerId] = useState<string | null>(null)
  const [startValidationHints, setStartValidationHints] = useState<string[] | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({})
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<FeedbackType>(null)
  const [feedbackScoreDelta, setFeedbackScoreDelta] = useState<number | null>(null)
  const [feedbackContext, setFeedbackContext] = useState<FeedbackOverlayContext | null>(null)
  const [showQuestionModal, setShowQuestionModal] = useState(false)
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)
  const serverClockOffsetRef = useRef(0)
  const streamConnectedRef = useRef(false)
  const correctAnswerAudioRef = useRef<HTMLAudioElement | null>(null)
  const wrongAnswerAudioRef = useRef<HTMLAudioElement | null>(null)

  const syncServerClock = useCallback((serverTs: number) => {
    const measuredOffset = serverTs - Date.now()
    serverClockOffsetRef.current = serverClockOffsetRef.current * 0.8 + measuredOffset * 0.2
  }, [])

  const releaseRoomBinding = useCallback((message?: string) => {
    clearHostRoomId()
    setRoomId(null)
    setRoom(null)
    setBootstrapBlocked(false)
    if (message) {
      setNotice(message)
    }
  }, [])

  useEffect(() => {
    if (!hostToken) {
      router.replace("/host/login")
    }
  }, [hostToken, router])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now() + serverClockOffsetRef.current)
    }, CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const correctAudio = new Audio("/sounds/correct-answer.mp3")
    correctAudio.preload = "auto"
    correctAnswerAudioRef.current = correctAudio

    const wrongAudio = new Audio("/sounds/wrong-answer.mp3")
    wrongAudio.preload = "auto"
    wrongAnswerAudioRef.current = wrongAudio

    return () => {
      correctAudio.pause()
      wrongAudio.pause()
      correctAnswerAudioRef.current = null
      wrongAnswerAudioRef.current = null
    }
  }, [])

  const playCorrectAnswerSound = useCallback(() => {
    const audio = correctAnswerAudioRef.current
    if (!audio) {
      return
    }

    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise) {
      void playPromise.catch(() => {
        // Browser autoplay policy may block playback before first user interaction.
      })
    }
  }, [])

  const playWrongAnswerSound = useCallback(() => {
    const audio = wrongAnswerAudioRef.current
    if (!audio) {
      return
    }

    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise) {
      void playPromise.catch(() => {
        // Browser autoplay policy may block playback before first user interaction.
      })
    }
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
    if (!notice) {
      return
    }

    const timeout = window.setTimeout(() => {
      setNotice(null)
    }, 3200)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [notice])

  useEffect(() => {
    if (!startValidationHints) {
      return
    }

    const timeout = window.setTimeout(() => {
      setStartValidationHints(null)
    }, 10000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [startValidationHints])

  useEffect(() => {
    const currentQId = room?.trivia?.selectedClue?.questionId ?? null
    if (currentQId && currentQId !== lastQuestionId) {
      setLastQuestionId(currentQId)
      setShowQuestionModal(true)
    } else if (!currentQId && lastQuestionId) {
      setLastQuestionId(null)
      setShowQuestionModal(false)
    }
  }, [room?.trivia?.selectedClue?.questionId, lastQuestionId])

  const [processedFeedbackQuestionId, setProcessedFeedbackQuestionId] = useState<string | null>(null)

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

        if (wasCorrect) {
          playCorrectAnswerSound()

          const end = Date.now() + 3 * 1000 // 3 seconds
          const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1", "#10b981", "#3b82f6"]

          const frame = () => {
            if (Date.now() > end) return
            confetti({
              particleCount: 3,
              angle: 60,
              spread: 60,
              startVelocity: 65,
              origin: { x: 0, y: 0.6 },
              colors: colors,
              zIndex: 50,
            })
            confetti({
              particleCount: 3,
              angle: 120,
              spread: 60,
              startVelocity: 65,
              origin: { x: 1, y: 0.6 },
              colors: colors,
              zIndex: 50,
            })
            requestAnimationFrame(frame)
          }

          frame()
        } else {
          playWrongAnswerSound()
        }
      }
    }
    // Reset tracker when return to board
    if (room?.trivia?.phase === "board_turn") {
      setProcessedFeedbackQuestionId(null)
      setFeedbackState(null)
      setFeedbackScoreDelta(null)
      setFeedbackContext(null)
    }
  }, [
    playCorrectAnswerSound,
    playWrongAnswerSound,
    processedFeedbackQuestionId,
    room,
  ])

  const joinUrl = useMemo(() => {
    if (!roomId || typeof window === "undefined") {
      return null
    }

    return `${window.location.origin}/join/${roomId}`
  }, [roomId])

  const joinQrUrl = useMemo(() => {
    if (!joinUrl) {
      return null
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=620x620&margin=16&data=${encodeURIComponent(joinUrl)}`
  }, [joinUrl])

  const stage: HostStage = useMemo(() => {
    if (!room) {
      return "lobby"
    }

    if (room.state === "paused_wait_host") {
      return "paused"
    }

    if (room.state === "between_games" && room.trivia.status === "completed") {
      return "celebration"
    }

    if (room.state === "game_live" && room.trivia.status === "in_progress") {
      return "trivia"
    }

    if (room.state === "teams_ready") {
      return "overview"
    }

    return "lobby"
  }, [room])

  const hostPollMs = resolveHostPollMs(room)

  const assignmentByPlayer = useMemo(
    () => new Map((room?.teamAssignments ?? []).map((entry) => [entry.playerId, entry.teamId])),
    [room?.teamAssignments]
  )

  const playerById = useMemo(
    () => new Map((room?.players ?? []).map((player) => [player.playerId, player])),
    [room?.players]
  )

  const playersByTeam = useMemo(() => {
    const grouped = {
      team_a: [] as RoomSnapshot["players"],
      team_b: [] as RoomSnapshot["players"],
      unassigned: [] as RoomSnapshot["players"],
    }

    if (!room) {
      return grouped
    }

    for (const player of room.players) {
      const mappedTeam = assignmentByPlayer.get(player.playerId)
      if (mappedTeam === "team_a") {
        grouped.team_a.push(player)
      } else if (mappedTeam === "team_b") {
        grouped.team_b.push(player)
      } else {
        grouped.unassigned.push(player)
      }
    }

    return grouped
  }, [assignmentByPlayer, room])

  const startSessionReadiness = useMemo(() => {
    const hints: string[] = []

    if (!room) {
      return { canStart: false, hints: ["في انتظار تحميل الغرفة."] }
    }

    if (room.playerCount <= 0) {
      hints.push("انتظر انضمام لاعب واحد على الأقل قبل البدء.")
    }

    const hasInvalidTeamName = room.teams.some((team) => {
      const draftName = teamNameDrafts[team.teamId] ?? team.name ?? ""
      const trimmed = draftName.trim()
      return (
        trimmed === "" ||
        trimmed.length < 1 ||
        trimmed.length > 24 ||
        trimmed === "اسم الفريق" ||
        trimmed === "Team A" ||
        trimmed === "Team B"
      )
    })

    if (hasInvalidTeamName) {
      hints.push("أدخل اسمًا لكل فريق (حرف واحد على الأقل).")
    }

    if (playersByTeam.unassigned.length > 0) {
      hints.push(`وزّع جميع اللاعبين على الفرق. المتبقي الآن: ${playersByTeam.unassigned.length}.`)
    }

    return { canStart: hints.length === 0, hints }
  }, [playersByTeam.unassigned.length, room, teamNameDrafts])

  useEffect(() => {
    if (!room) {
      return
    }

    setTeamNameDrafts((previous) => {
      const next: Record<string, string> = {}
      for (const team of room.teams) {
        const preserved = previous[team.teamId]
        next[team.teamId] = preserved && preserved.trim().length > 0 ? preserved : team.name
      }
      return next
    })
  }, [room])

  const refreshState = useCallback(async () => {
    if (!hostToken || !roomId) {
      return
    }
    if (refreshInFlightRef.current) {
      return
    }

    refreshInFlightRef.current = true

    try {
      const response = await getRoomState(roomId, hostToken)
      syncServerClock(response.ts)
      if (isTerminalRoomState(response.payload.room.state)) {
        setError(null)
        releaseRoomBinding("انتهت الغرفة السابقة. جارٍ تجهيز غرفة جديدة.")
        return
      }
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      if (
        requestError instanceof LiveApiError &&
        (requestError.code === "ROOM_NOT_FOUND" || requestError.code === "HOST_ROOM_MISMATCH")
      ) {
        releaseRoomBinding("تعذر الوصول إلى الغرفة السابقة. جارٍ تجهيز غرفة جديدة.")
        return
      }

      setError(toErrorMessage(requestError))
    } finally {
      refreshInFlightRef.current = false
    }
  }, [hostToken, releaseRoomBinding, roomId, syncServerClock])

  const bootstrapRoom = useCallback(async () => {
    if (!hostToken || roomId || isBootstrappingRoom) {
      return
    }

    setIsBootstrappingRoom(true)
    setBootstrapBlocked(false)
    setError(null)
    setNotice(null)

    try {
      const created = await createRoom(hostToken)
      setRoomId(created.room.roomId)
      setHostRoomId(created.room.roomId)
      setRoom(created.room)
      setNotice("تم إنشاء غرفة جديدة. اعرض رمز QR ليبدأ اللاعبون بالانضمام.")
    } catch (requestError) {
      if (requestError instanceof LiveApiError && requestError.code === "HOST_ALREADY_ACTIVE") {
        const activeRoomId =
          typeof requestError.details?.activeRoomId === "string" ? requestError.details.activeRoomId : null
        if (activeRoomId) {
          setRoomId(activeRoomId)
          setHostRoomId(activeRoomId)
          setNotice("تم استئناف غرفة المضيف الحالية.")
          return
        }
      }

      setError(toErrorMessage(requestError))
      setBootstrapBlocked(true)
    } finally {
      setIsBootstrappingRoom(false)
    }
  }, [hostToken, isBootstrappingRoom, roomId])

  useEffect(() => {
    if (!hostToken) {
      return
    }

    if (!roomId) {
      if (bootstrapBlocked) {
        return
      }
      void bootstrapRoom()
      return
    }

    void refreshState()
  }, [bootstrapBlocked, bootstrapRoom, hostToken, refreshState, roomId])

  useEffect(() => {
    if (!hostToken || !roomId || !isPageVisible) {
      streamConnectedRef.current = false
      return
    }

    const unsubscribe = subscribeRoomStateStream({
      roomId,
      token: hostToken,
      onOpen: () => {
        streamConnectedRef.current = true
      },
      onClose: () => {
        streamConnectedRef.current = false
      },
      onError: (streamError) => {
        streamConnectedRef.current = false
        if (isFatalHostSessionError(streamError)) {
          releaseRoomBinding("انتهت صلاحية الغرفة الحالية. جارٍ تجهيز غرفة جديدة.")
          return
        }
        setError(toErrorMessage(streamError))
      },
      onState: (envelope) => {
        syncServerClock(envelope.ts)
        if (isTerminalRoomState(envelope.payload.room.state)) {
          setError(null)
          releaseRoomBinding("تم إغلاق الغرفة الحالية. جارٍ تجهيز غرفة جديدة.")
          return
        }
        setRoom(envelope.payload.room)
        setError(null)
      },
    })

    return () => {
      streamConnectedRef.current = false
      unsubscribe()
    }
  }, [hostToken, isPageVisible, releaseRoomBinding, roomId, syncServerClock])

  useEffect(() => {
    if (!hostToken || !roomId) {
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
          schedule(hostPollMs)
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
  }, [hostPollMs, hostToken, isPageVisible, refreshState, roomId])

  useEffect(() => {
    if (!hostToken || !roomId) {
      return
    }

    const timer = window.setInterval(() => {
      if (!isPageVisible) {
        return
      }
      void sendAction(roomId, hostToken, "host.heartbeat")
        .then((ack) => {
          syncServerClock(ack.ts)
        })
        .catch(() => {
          // Ignore transient heartbeat failures; polling path handles visible errors.
        })
    }, HOST_HEARTBEAT_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [hostToken, isPageVisible, roomId, syncServerClock])

  const runAction = useCallback(
    async (type: HostActionType, payload?: Record<string, unknown>) => {
      if (!hostToken || !roomId) {
        throw new LiveApiError(401, "UNAUTHORIZED", "Host session is missing")
      }

      const guardError = getHostActionGuardError(room, type)
      if (guardError) {
        throw new LiveApiError(409, "ACTION_BLOCKED_CLIENT", guardError, {
          state: room?.state,
          phase: room?.trivia.phase,
          action: type,
        })
      }

      setBusyAction(type)
      setError(null)
      setNotice(null)

      try {
        const ack = await sendAction(roomId, hostToken, type, payload)
        syncServerClock(ack.ts)
        setRoom(ack.payload.room)
        return ack.payload.room
      } catch (requestError) {
        if (
          requestError instanceof LiveApiError &&
          (requestError.code === "INVALID_STATE_TRANSITION" || requestError.code === "ROOM_NOT_ACTIVE")
        ) {
          void refreshState()
        }
        throw requestError
      } finally {
        setBusyAction(null)
      }
    },
    [hostToken, refreshState, room, roomId, syncServerClock]
  )

  const assignPlayer = useCallback(
    async (playerId: string, teamId: string) => {
      try {
        await runAction("host.assignPlayerTeam", { playerId, teamId })
      } catch (requestError) {
        setError(toErrorMessage(requestError))
      }
    },
    [runAction]
  )

  const handleRenameTeam = useCallback(
    async (teamId: string) => {
      const draft = teamNameDrafts[teamId] ?? ""
      const name = draft
        .trim()
        .replace(/\s+/g, " ")
      if (name.length < 1 || name.length > 24) {
        setError("اسم الفريق يجب أن يكون بين حرف واحد و24 حرفًا.")
        return
      }

      try {
        setRenamingTeamId(teamId)
        await runAction("host.renameTeam", { teamId, name })
        setNotice(`تم تحديث اسم الفريق إلى: ${name}`)
      } catch (requestError) {
        setError(toErrorMessage(requestError))
      } finally {
        setRenamingTeamId(null)
      }
    },
    [runAction, teamNameDrafts]
  )

  const handleStartSession = useCallback(async () => {
    if (!hostToken || !roomId || !room) {
      return
    }

    if (!startSessionReadiness.canStart) {
      setStartValidationHints(startSessionReadiness.hints)
      return
    }

    setBusyAction("host.prepareSession")
    setStartValidationHints(null)
    setError(null)
    setNotice(null)

    try {
      // Auto-save team names
      for (const team of room.teams) {
        const draft = teamNameDrafts[team.teamId] ?? ""
        const name = draft.trim().replace(/\s+/g, " ")
        if (name.length >= 1 && name.length <= 24) {
          try {
            await sendAction(roomId, hostToken, "host.renameTeam", { teamId: team.teamId, name })
          } catch (err) {
            console.warn("Failed to rename team", team.teamId, err)
          }
        }
      }

      try {
        const lockAck = await sendAction(roomId, hostToken, "host.lockLobby")
        setRoom(lockAck.payload.room)
      } catch (requestError) {
        if (!isInvalidTransitionAt(requestError, ["lobby_locked", "teams_ready", "game_live"])) {
          throw requestError
        }
      }

      try {
        const teamsAck = await sendAction(roomId, hostToken, "host.startTeams")
        setRoom(teamsAck.payload.room)
      } catch (requestError) {
        if (!isInvalidTransitionAt(requestError, ["teams_ready", "game_live"])) {
          throw requestError
        }
      }

      setNotice("تم تثبيت الفرق. استعرض القواعد ثم ابدأ لوحة اللعبة.")
      await refreshState()
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    } finally {
      setBusyAction(null)
    }
  }, [hostToken, refreshState, room, roomId, startSessionReadiness, teamNameDrafts])

  const handleAssignPlayerFromPicker = useCallback(
    async (teamId: string) => {
      if (!teamPickerPlayerId) {
        return
      }

      await assignPlayer(teamPickerPlayerId, teamId)
      setTeamPickerPlayerId(null)
    },
    [assignPlayer, teamPickerPlayerId]
  )

  const handleStartTrivia = useCallback(async () => {
    try {
      await runAction("host.startTrivia")
      setNotice("بدأت لوحة اللعبة. الفريق الحالي يختار الفئة والنقاط.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

  const handleResumeSession = useCallback(async () => {
    try {
      await runAction("host.resumeSession")
      setNotice("تم استئناف الجلسة.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

  const handleSelectTriviaClue = useCallback(
    async (questionId: string) => {
      try {
        await runAction("host.selectTriviaClue", { questionId })
        setShowQuestionModal(true)
      } catch (requestError) {
        setError(toErrorMessage(requestError))
      }
    },
    [runAction]
  )

  const handleSelectAnotherResponder = useCallback(async () => {
    try {
      const nextRoom = await runAction("host.selectAnotherResponder")
      const nextResponder = nextRoom.players.find(
        (player) => player.playerId === nextRoom.trivia.currentResponderPlayerId
      )
      const nextPicker = nextRoom.players.find((player) => player.playerId === nextRoom.trivia.currentPickerPlayerId)
      if (nextRoom.trivia.phase === "answer_active" && nextResponder) {
        setNotice(`تم اختيار ${nextResponder.displayName} للإجابة من نفس الفريق.`)
      } else if (nextPicker) {
        setNotice(`تم اختيار ${nextPicker.displayName} ليقوم بالاختيار لهذا الدور.`)
      } else {
        setNotice("تم اختيار لاعب بديل.")
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

  const handleAdvanceTurn = useCallback(async () => {
    try {
      await runAction("host.nextQuestion")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

  const handleEndSession = useCallback(async () => {
    try {
      const nextRoom = await runAction("host.endSession")
      if (isTerminalRoomState(nextRoom.state)) {
        releaseRoomBinding("تم إنهاء الجلسة بنجاح. جارٍ تجهيز غرفة جديدة.")
        return
      }
      setNotice("تم إنهاء الجلسة بنجاح.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [releaseRoomBinding, runAction])

  const handleLogout = () => {
    clearHostSession()
    setHostTokenState(null)
    setRoomId(null)
    setRoom(null)
    setNotice(null)
    setError(null)
    router.replace("/host/login")
  }

  const trivia = room?.trivia ?? null
  const currentTurnTeam = room?.teams.find((team) => team.teamId === trivia?.currentTeamId) ?? null
  const currentPicker = trivia?.currentPickerPlayerId ? playerById.get(trivia.currentPickerPlayerId) ?? null : null
  const responderTeam = room?.teams.find((team) => team.teamId === trivia?.currentResponderTeamId) ?? null
  const responderPlayer = trivia?.currentResponderPlayerId
    ? playerById.get(trivia.currentResponderPlayerId) ?? null
    : null
  const selectedClue = trivia?.selectedClue ?? null
  const currentTone = getTeamTone(responderTeam?.teamId ?? currentTurnTeam?.teamId ?? null)
  const countdownSeconds = remainingSeconds(trivia?.countdownEndsAt ?? null, nowTs)
  const buzzSeconds = remainingSeconds(trivia?.buzzEndsAt ?? null, nowTs)
  const answerSeconds = remainingSeconds(trivia?.answerEndsAt ?? null, nowTs)

  const canSelectAnotherResponder =
    trivia?.status === "in_progress" && (trivia.phase === "answer_active" || trivia.phase === "board_turn")

  const canManageTeams = room?.state === "lobby_open" || room?.state === "lobby_locked" || room?.state === "teams_ready"
  const canStartSession = Boolean(canManageTeams && startSessionReadiness.canStart)

  const canStartTrivia = room?.state === "teams_ready" || room?.state === "between_games"
  const canResumeSession = room?.state === "paused_wait_host"
  const canEndSession = Boolean(room && !isTerminalRoomState(room.state))

  const canSelectClue = trivia?.status === "in_progress" && trivia.phase === "board_turn"
  const canAdvanceFromQuestionModal =
    trivia?.status === "in_progress" &&
    (trivia.phase === "answer_reveal" ||
      trivia.phase === "countdown" ||
      trivia.phase === "buzzer_open" ||
      trivia.phase === "answer_active")
  const isCountdownPhase = trivia?.phase === "countdown"
  const isQuestionRevealed =
    trivia?.phase === "buzzer_open" || trivia?.phase === "answer_active" || trivia?.phase === "answer_reveal"
  const revealResult =
    trivia?.phase === "answer_reveal" && trivia?.lastResult?.questionId === selectedClue?.questionId ? trivia.lastResult : null
  const hasScoredReveal = Boolean(revealResult && revealResult.reason !== "no_buzz" && revealResult.reason !== "host_skip")

  const handleQuestionModalExit = useCallback(async () => {
    setFeedbackState(null)

    if (!canAdvanceFromQuestionModal) {
      setShowQuestionModal(false)
      return
    }

    await handleAdvanceTurn()
  }, [canAdvanceFromQuestionModal, handleAdvanceTurn])

  const boardRowIndexes = useMemo(() => {
    const maxRows = Math.max(...(trivia?.board ?? []).map((category) => category.clues.length), 0)
    return Array.from({ length: maxRows }, (_, index) => index)
  }, [trivia?.board])

  const liveStatusCommandText = useMemo(() => {
    const teamName = currentTurnTeam?.name ?? "الفريق الحالي"
    const pickerName = currentPicker?.displayName ?? "لاعب الفريق"

    if (trivia?.phase === "board_turn") {
      return `${pickerName} من ${teamName} اختر سؤال`
    }

    if (trivia?.phase === "countdown" || trivia?.phase === "buzzer_open" || trivia?.phase === "answer_active") {
      const responderName = responderPlayer?.displayName ?? pickerName
      const responderTeamName = responderTeam?.name ?? teamName
      return `${responderName} من ${responderTeamName} يجيب الآن`
    }

    if (trivia?.phase === "answer_reveal") {
      return "تم كشف النتيجة. العودة للوحة لاختيار سؤال جديد."
    }

    return `${pickerName} من ${teamName} اختر سؤال`
  }, [currentPicker?.displayName, currentTurnTeam?.name, responderPlayer?.displayName, responderTeam?.name, trivia?.phase])

  const winningSummary = useMemo(() => {
    if (!room) {
      return null
    }

    const sorted = [...room.teams].sort((a, b) => b.score - a.score)
    const top = sorted[0]
    if (!top) {
      return null
    }

    const tied = sorted.filter((team) => team.score === top.score)
    return {
      top,
      tied,
      sorted,
    }
  }, [room])

  const orderedTeams = useMemo(() => {
    return [...(room?.teams ?? [])].sort((a, b) => a.order - b.order)
  }, [room?.teams])
  const teamPickerPlayer = useMemo(() => {
    if (!room || !teamPickerPlayerId) {
      return null
    }

    return room.players.find((player) => player.playerId === teamPickerPlayerId) ?? null
  }, [room, teamPickerPlayerId])
  const isTriviaStage = Boolean(room && stage === "trivia")
  const fireworksBasePopulation = isTriviaStage ? 0.5 : 1
  const fireworksDemoPopulation = 1
  const fireworksExplosionHeight = isTriviaStage ? { min: 0.08, max: 0.34 } : { min: 0, max: 0.15 }

  return (
    <div className={`relative overflow-hidden text-foreground ${isTriviaStage ? "h-[100dvh]" : "min-h-screen"}`}>
      <FeedbackOverlay
        currentStatus={feedbackState}
        scoreDelta={feedbackState ? feedbackScoreDelta : null}
        context={feedbackState ? feedbackContext : null}
        correctSummaryPanelClassName="border-emerald-200/70 bg-black/70"
        onComplete={() => {
          setFeedbackState(null)
          setFeedbackScoreDelta(null)
          setFeedbackContext(null)
        }}
      />
      <FireworksBackground
        population={fireworksBasePopulation}
        particleSpeed={4}
        explosionHeight={fireworksExplosionHeight}
        className={`absolute inset-0 z-0 pointer-events-none ${isTriviaStage ? "opacity-90" : "opacity-80"}`}
      />
      <FireworksBackgroundDemo population={fireworksDemoPopulation} />
      <div className="party-stage-bg" />
      <div className="party-stage-grid" />
      <div className="pointer-events-none absolute -left-28 top-12 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

      <main
        className={`relative z-10 mx-auto w-full max-w-[1820px] px-4 sm:px-8 ${isTriviaStage ? "h-full overflow-hidden pb-4 pt-4" : "min-h-screen pb-28 pt-5"
          }`}
      >
        {error ? <p className="party-status-error mb-3 rounded-xl px-4 py-3 text-sm font-medium">{error}</p> : null}
        <AnimatePresence>
          {startValidationHints ? (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              className="fixed inset-x-0 top-4 z-[70] mx-auto w-[min(52rem,95vw)] rounded-2xl border border-amber-200/40 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md"
            >
              <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">لا يمكن بدء الفعالية الآن</p>
              <p className="mt-1 text-sm text-slate-100">أكمل الإجراءات التالية قبل الضغط على ابدأ الفعالية:</p>
              <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-slate-200">
                {startValidationHints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-100/90">هذه الرسالة ستختفي تلقائيًا خلال 10 ثوانٍ.</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!room ? (
          <section className="party-surface-strong rounded-3xl p-10 text-center">
            <p className="text-lg text-slate-100">
              {isBootstrappingRoom ? "جارٍ تجهيز الغرفة..." : "في انتظار بيانات الغرفة..."}
            </p>
          </section>
        ) : null}

        {room && stage === "lobby" ? (
          <section className="grid gap-4 xl:grid-cols-[37rem_1fr]">
            <article className="backdrop-blur-lg bg-black/30 border border-white/10 rounded-3xl p-5 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100/85">Join QR</p>
              <h2 className="mt-2 text-3xl font-bold">امسح الرمز للانضمام</h2>
              <p className="mt-2 text-base text-slate-200">
                امسح QR من جوال اللاعب ثم أدخل الاسم. استمر في توزيع اللاعبين بين الفريقين أثناء الانضمام.
              </p>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/25 bg-white p-3 shadow-xl">
                {joinQrUrl ? (
                  <img src={joinQrUrl} alt="Room join QR code" className="mx-auto h-auto w-full rounded-xl" />
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                    QR غير متاح
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-white/20 bg-black/20 p-3 text-sm">
                <p className="text-slate-300">رابط الانضمام:</p>
                {joinUrl ? (
                  <a className="break-all text-cyan-200 underline" href={joinUrl} target="_blank" rel="noreferrer">
                    {joinUrl}
                  </a>
                ) : (
                  <p className="text-slate-400">غير متاح</p>
                )}
              </div>



              <Button
                type="button"
                className={`${HOST_ACTION_BUTTON_CLASS} mt-5 w-full text-lg ${canStartSession ? "" : "ring-2 ring-amber-200/45"}`}
                disabled={Boolean(busyAction)}
                onClick={() => void handleStartSession()}
              >
                {busyAction === "host.prepareSession" ? "جاري تجهيز الفرق..." : "ابدأ الفعالية"}
              </Button>
            </article>

            <article className="backdrop-blur-lg bg-black/30 border border-white/10 space-y-4 rounded-3xl p-5 shadow-2xl">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-100/85">Players</p>
                <h2 className="mt-2 text-3xl font-bold">اللاعبون المنضمون</h2>
                <p className="mt-2 text-base text-slate-200">
                  اضغط زر <span className="font-bold">+</span> فوق صورة اللاعب ثم اختر الفريق المناسب.
                </p>
              </div>

              {/* Team Names Inputs (Moved here to be in the same block) */}
              <div className="mt-4 rounded-xl border border-white/20 bg-white/10 p-3">
                <p className="text-sm font-semibold text-slate-100">أسماء الفرق</p>
                <p className="mt-1 text-xs text-amber-300">يجب تعبئة هذا الحقل وإدخال اسم مميز للفريق للبدء.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {room.teams.map((team) => {
                    const tone = getTeamTone(team.teamId)
                    return (
                      <div key={`name-editor-${team.teamId}`} className="rounded-xl border border-white/15 bg-black/20 p-2.5">
                        <label className="mb-1 block text-xs text-slate-300">{team.teamId === "team_a" ? "الفريق الأول" : "الفريق الثاني"}</label>
                        <div className="flex items-center gap-2">
                          <input
                            value={teamNameDrafts[team.teamId] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value
                              setTeamNameDrafts((previous) => ({ ...previous, [team.teamId]: value }))
                            }}
                            className={`h-10 flex-1 rounded-lg border bg-black/30 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400/50 ${tone.border}`}
                            maxLength={24}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="py-4">
                {room.players.length === 0 ? (
                  <p className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm text-slate-300">
                    لا يوجد لاعبين بعد. انتظر الانضمامات عبر QR.
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-4 p-2">
                    <AvatarGroup>
                      {room.players.map((player) => {
                        const teamId = assignmentByPlayer.get(player.playerId) ?? null
                        const tone = getTeamTone(teamId)
                        const isPickerOpen = teamPickerPlayerId === player.playerId
                        return (
                          <div key={player.playerId} className="relative">
                            <Avatar
                              className={`size-16 border-2 shadow-xl hover:z-50 sm:size-20 ${teamId ? tone.border : "border-slate-500"} ${isPickerOpen ? "ring-2 ring-amber-300/60" : ""}`}
                            >
                              {player.avatarValue ? (
                                <AvatarImage src={player.avatarValue} className="object-cover" />
                              ) : null}
                              <AvatarFallback className={`${teamId ? tone.bg : "bg-slate-700"} text-2xl`}>
                                {player.avatarType === "emoji" ? player.avatarValue : "🙂"}
                              </AvatarFallback>
                              <AvatarGroupTooltip>{player.displayName}</AvatarGroupTooltip>
                            </Avatar>
                            <button
                              type="button"
                              onClick={() => setTeamPickerPlayerId(player.playerId)}
                              className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-amber-300 text-slate-950 shadow-lg transition hover:scale-105 active:scale-95 animate-[pulse_1s_ease-in-out_infinite]"
                              aria-label={`تعيين ${player.displayName} إلى فريق`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </AvatarGroup>
                  </div>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {room.teams.map((team) => {
                  const tone = getTeamTone(team.teamId)
                  const teamPlayers = team.teamId === "team_a" ? playersByTeam.team_a : playersByTeam.team_b

                  return (
                    <div
                      key={team.teamId}
                      className={`min-h-52 rounded-2xl border-2 p-4 transition-all ${tone.border} ${tone.bg}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className={`text-xl font-bold ${tone.text}`}>{team.name}</p>
                        <p className="text-sm text-slate-200">{teamPlayers.length} لاعب</p>
                      </div>

                      <div className="space-y-2">
                        {teamPlayers.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-white/25 p-3 text-sm text-slate-300">
                            لا يوجد لاعب في هذا الفريق بعد.
                          </p>
                        ) : null}

                        {teamPlayers.map((player) => (
                          <div
                            key={`${team.teamId}-${player.playerId}`}
                            className="rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-sm"
                          >
                            {player.displayName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          </section>
        ) : null}

        <AnimatePresence>
          {room && stage === "lobby" && teamPickerPlayer ? (
            <div
              className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
              onClick={() => setTeamPickerPlayerId(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="w-full max-w-xl rounded-3xl border border-white/20 bg-slate-950 p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">Choose Team</p>
                    <h3 className="mt-1 text-2xl font-black text-white">اختر الفريق</h3>
                    <p className="mt-1 text-sm text-slate-200">
                      اختر فريق اللاعب <span className="font-bold text-amber-200">{teamPickerPlayer.displayName}</span>.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => setTeamPickerPlayerId(null)}
                    className="rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {orderedTeams.map((team) => {
                    const tone = getTeamTone(team.teamId)
                    const colorLabel = getTeamColorLabel(team.teamId)
                    const showTeamName = !isDefaultTeamName(team.teamId, team.name)
                    return (
                      <button
                        key={`picker-team-${team.teamId}`}
                        type="button"
                        onClick={() => void handleAssignPlayerFromPicker(team.teamId)}
                        className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:brightness-110 ${tone.border} ${tone.bg}`}
                      >
                        <p className={`text-lg font-black ${tone.text}`}>
                          {showTeamName ? team.name : `الفريق ${colorLabel}`}
                        </p>
                        <p className="mt-1 text-sm text-slate-200">
                          {showTeamName ? `اللون: ${colorLabel}` : "الاعتماد على اللون فقط"}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>

        {room && stage === "overview" ? (
          <section className="flex min-h-[calc(100dvh-8.5rem)] items-center justify-center">
            <div className="party-surface-strong w-full max-w-6xl rounded-3xl p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100/85">نظرة عامة</p>
              <h2 className="mt-2 text-4xl font-bold">قواعد اللعبة قبل البداية</h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
                  <h3 className="text-2xl font-bold">آلية اللعب</h3>
                  <ul className="mt-3 space-y-2 text-base text-slate-200">
                    <li>1. كل دور لفريق واحد لاختيار الفئة والنقاط.</li>
                    <li>2. بعد الاختيار يبدأ عد تنازلي 5 ثوانٍ قبل كشف السؤال.</li>
                    <li>3. البازر مفتوح للجميع لمدة 20 ثانية.</li>
                    <li>4. أول لاعب يضغط البازر هو الوحيد الذي يرى الخيارات ويجيب.</li>
                  </ul>
                </article>
                <article className="rounded-2xl border border-white/20 bg-white/10 p-4">
                  <h3 className="text-2xl font-bold">النقاط</h3>
                  <ul className="mt-3 space-y-2 text-base text-slate-200">
                    <li>1. إجابة صحيحة = إضافة قيمة السؤال.</li>
                    <li>2. إجابة خاطئة = خصم قيمة السؤال.</li>
                    <li>3. لا يوجد سرقة نقاط في هذا الوضع.</li>
                    <li>4. يمكن للمضيف اختيار لاعب بديل من نفس الفريق عند الحاجة.</li>
                  </ul>
                </article>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                  disabled={Boolean(busyAction) || !canStartTrivia}
                  onClick={() => void handleStartTrivia()}
                >
                  ابدأ اللعبة
                </Button>
                <Button
                  type="button"
                  className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                  disabled={Boolean(busyAction) || !canEndSession}
                  onClick={() => void handleEndSession()}
                >
                  إنهاء الجلسة
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {room && stage === "paused" ? (
          <section className="party-surface-strong rounded-3xl border-amber-300/40 bg-amber-500/10 p-8 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-100/90">Paused</p>
            <h2 className="mt-2 text-4xl font-black text-amber-100">الجلسة متوقفة بانتظار عودة المضيف</h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-100">
              تم إيقاف الفعالية مؤقتًا بسبب عدم نشاط المضيف. أمامك 20 دقيقة لاستئناف الجلسة قبل إنهائها تلقائيًا.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                disabled={Boolean(busyAction) || !canResumeSession}
                onClick={() => void handleResumeSession()}
              >
                استئناف الجلسة الآن
              </Button>
              <Button
                type="button"
                className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                disabled={Boolean(busyAction) || !canEndSession}
                onClick={() => void handleEndSession()}
              >
                إنهاء الجلسة
              </Button>
            </div>
          </section>
        ) : null}

        {room && stage === "trivia" ? (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="grid shrink-0 gap-3 lg:grid-cols-3">
              {orderedTeams[0] ? (
                <article
                  key={orderedTeams[0].teamId}
                  className={`rounded-2xl border p-4 text-center shadow-xl ${getTeamTone(orderedTeams[0].teamId).border} ${getTeamTone(orderedTeams[0].teamId).bg}`}
                >
                  <p className={`text-xl font-semibold ${getTeamTone(orderedTeams[0].teamId).text}`}>{orderedTeams[0].name}</p>
                  <p className="mt-1 text-6xl font-black leading-none">{orderedTeams[0].score}</p>
                </article>
              ) : null}

              <article
                className={`party-surface relative flex h-full items-center justify-center overflow-hidden rounded-2xl border p-4 text-center shadow-xl ${currentTone.border} ${currentTone.bg}`}
              >
                <BorderBeam
                  duration={6}
                  size={400}
                  className="from-transparent via-amber-400 to-transparent"
                />
                <BorderBeam
                  duration={6}
                  delay={3}
                  size={400}
                  borderWidth={2}
                  className="from-transparent via-cyan-400 to-transparent"
                />
                <h2 className="relative text-3xl font-black leading-tight text-white lg:text-4xl">{liveStatusCommandText}</h2>
              </article>

              {orderedTeams[1] ? (
                <article
                  key={orderedTeams[1].teamId}
                  className={`rounded-2xl border p-4 text-center shadow-xl ${getTeamTone(orderedTeams[1].teamId).border} ${getTeamTone(orderedTeams[1].teamId).bg}`}
                >
                  <p className={`text-xl font-semibold ${getTeamTone(orderedTeams[1].teamId).text}`}>{orderedTeams[1].name}</p>
                  <p className="mt-1 text-6xl font-black leading-none">{orderedTeams[1].score}</p>
                </article>
              ) : null}
            </div>

            {/* Game Board - Now Full Width */}
            <article
              className="party-surface-strong flex min-h-0 flex-1 flex-col rounded-3xl p-4 shadow-2xl"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            >
              <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="text-center lg:text-right">
                  <p className="text-xs uppercase tracking-[0.25em] text-pink-200">لوحة اللعبة</p>
                  <h3 className="mt-1 text-2xl font-black lg:text-3xl">اختر فئة وقيمة النقاط</h3>
                </div>
                <div className="flex items-center gap-3">
                  <p className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-base font-bold lg:text-lg">
                    المتبقي: {trivia?.remainingQuestions ?? 0}
                  </p>
                  {selectedClue && (
                    <Button
                      onClick={() => setShowQuestionModal(true)}
                      className={`${HOST_ACTION_BUTTON_CLASS} px-4`}
                    >
                      عرض السؤال الحالي
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-6 grid-rows-[auto_repeat(5,minmax(0,1fr))] gap-2 lg:gap-3 p-2">
                {(trivia?.board ?? []).map((category) => (
                  <div
                    key={`header-${category.categoryId}`}
                    className="flex min-h-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 px-2 py-2 text-center text-[0.8rem] md:text-sm lg:text-lg font-bold uppercase tracking-wide text-indigo-100 shadow-sm backdrop-blur-md"
                  >
                    {category.name}
                  </div>
                ))}

                {boardRowIndexes.map((rowIndex) =>
                  (trivia?.board ?? []).map((category) => {
                    const clue = category.clues[rowIndex]
                    if (!clue) {
                      return <div key={`empty-${category.categoryId}-${rowIndex}`} className="h-full min-h-0" />
                    }

                    const isSelected = clue.questionId === trivia?.selectedClue?.questionId
                    const isUsed = clue.used
                    return (
                      <button
                        key={`${category.categoryId}-${clue.questionId}`}
                        type="button"
                        disabled={Boolean(busyAction) || !canSelectClue || isUsed}
                        onClick={() => void handleSelectTriviaClue(clue.questionId)}
                        className={`group relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border-2 text-3xl font-black transition-all duration-200 lg:text-4xl ${isUsed
                          ? "border-transparent bg-slate-900/40 text-slate-700 shadow-inner backdrop-blur-sm"
                          : "border-indigo-500/30 bg-gradient-to-b from-indigo-900/80 to-slate-900/90 text-amber-400 shadow-sm backdrop-blur-md hover:-translate-y-1 hover:border-indigo-400/60 hover:from-indigo-800/90 hover:to-slate-800/90 hover:text-amber-300 hover:shadow-[0_8px_20px_rgba(79,70,229,0.25)] active:translate-y-0 active:scale-95"
                          } ${isSelected ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900" : ""}`}
                      >
                        {!isUsed && (
                          <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        )}
                        <span className="relative z-10">{isUsed ? "✓" : clue.points}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </article>

            {/* Question & Status Modal Overlay */}
            <AnimatePresence>
              {showQuestionModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-7xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] border border-white/20 bg-slate-950 p-6 md:p-12 shadow-[0_0_100px_rgba(139,92,246,0.3)] scrollbar-hide"
                  >
                    {/* Modal Header/Close */}
                    <div className="absolute right-6 top-6 flex gap-3">
                      <Button
                        size="icon"
                        onClick={() => void handleQuestionModalExit()}
                        className={`${HOST_ACTION_BUTTON_CLASS} rounded-full`}
                      >
                        <X className="size-6" />
                      </Button>
                    </div>

                    <div className="w-full">
                      <div className="space-y-6">
                        {selectedClue ? (
                          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-inner">
                            <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
                              <div>
                                <p className="text-sm uppercase tracking-[0.25em] text-violet-300">{selectedClue.categoryName}</p>
                                <h3 className="mt-2 text-3xl font-black">{selectedClue.points} نقطة</h3>
                              </div>

                              <div className="flex flex-wrap items-center gap-4">
                                {responderPlayer ? (
                                  <>
                                    <div
                                      className={`min-w-[24rem] rounded-2xl border px-6 py-4 shadow-[0_0_24px_inherit] animate-pulse ${currentTone.chip}`}
                                    >
                                      <p className="text-sm font-semibold opacity-90">اللاعب المكلّف بالإجابة</p>
                                      <p className="mt-1 text-3xl font-black">{responderPlayer.displayName}</p>
                                      <p className="mt-1 text-base font-semibold opacity-90">
                                        من {responderTeam?.name ?? currentTurnTeam?.name ?? "الفريق الحالي"}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      className={`${HOST_ACTION_BUTTON_CLASS} h-full min-h-[6rem] rounded-2xl px-7 py-5 text-lg`}
                                      disabled={Boolean(busyAction) || !canSelectAnotherResponder}
                                      onClick={() => void handleSelectAnotherResponder()}
                                    >
                                      تغيير اللاعب
                                    </Button>
                                  </>
                                ) : (
                                  <div className="min-w-[24rem] rounded-2xl border border-white/20 bg-white/5 px-6 py-4">
                                    <p className="text-sm font-semibold text-slate-300/90">الحالة الحالية</p>
                                    <span className="mt-1 block text-2xl font-black text-slate-200">
                                      {trivia?.phase === "board_turn" ? `دور فريق: ${currentTurnTeam?.name ?? "..."}` : "لالي يضغط اول يجاوب.."}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {isCountdownPhase ? (
                              <div className="flex flex-col items-center justify-center py-10">
                                <p className="mb-6 text-xl font-medium text-slate-200">استعدوا... السؤال سيظهر حالاً</p>
                                <motion.p
                                  key={countdownSeconds}
                                  initial={{ scale: 1.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="text-[10rem] font-black leading-none text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.45)]"
                                >
                                  {countdownSeconds}
                                </motion.p>
                              </div>
                            ) : null}

                            {isQuestionRevealed ? (
                              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                                <p className="text-5xl lg:text-6xl font-black leading-tight text-white mb-10 text-center">
                                  {selectedClue.prompt}
                                </p>

                                <div className="grid gap-6 sm:grid-cols-2">
                                  {selectedClue.options.map((option, index) => {
                                    const optionKey = OPTION_LETTERS[index] ?? "A"
                                    const isCorrectOption = hasScoredReveal && optionKey === revealResult?.correctOption
                                    const isAnsweredOption = hasScoredReveal && optionKey === revealResult?.answeredOption
                                    const isCorrectFlash = Boolean(isCorrectOption && revealResult?.wasCorrect)
                                    const isWrongFlash = Boolean(isAnsweredOption && !revealResult?.wasCorrect)
                                    const isCorrectReveal = Boolean(isCorrectOption && !revealResult?.wasCorrect)
                                    const dimOption = hasScoredReveal && !isCorrectOption && !isAnsweredOption

                                    return (
                                      <motion.div
                                        key={`${selectedClue.questionId}-${index}`}
                                        className={`group relative flex items-center overflow-hidden rounded-3xl border p-8 transition-colors ${dimOption
                                          ? "border-white/10 bg-white/5 opacity-70"
                                          : "border-white/10 bg-white/5 hover:bg-white/10"
                                          } ${isCorrectFlash || isCorrectReveal
                                            ? "border-emerald-300/70 text-emerald-50"
                                            : isWrongFlash
                                              ? "border-rose-300/80 text-rose-50"
                                              : ""
                                          }`}
                                        animate={
                                          isCorrectFlash
                                            ? {
                                              backgroundColor: ["rgba(16,185,129,0.22)", "rgba(16,185,129,0.68)", "rgba(16,185,129,0.44)"],
                                              borderColor: ["rgba(110,231,183,0.4)", "rgba(110,231,183,0.95)", "rgba(110,231,183,0.75)"],
                                            }
                                            : isWrongFlash
                                              ? {
                                                backgroundColor: [
                                                  "rgba(244,63,94,0.22)",
                                                  "rgba(244,63,94,0.72)",
                                                  "rgba(244,63,94,0.46)",
                                                ],
                                                borderColor: [
                                                  "rgba(253,164,175,0.45)",
                                                  "rgba(253,164,175,1)",
                                                  "rgba(253,164,175,0.8)",
                                                ],
                                              }
                                              : isCorrectReveal
                                                ? {
                                                  backgroundColor: ["rgba(16,185,129,0.15)", "rgba(16,185,129,0.44)"],
                                                  borderColor: ["rgba(110,231,183,0.4)", "rgba(110,231,183,0.8)"],
                                                }
                                                : undefined
                                        }
                                        transition={{
                                          duration: isCorrectFlash || isWrongFlash ? 0.95 : 0.7,
                                          times: isCorrectFlash || isWrongFlash ? [0, 0.45, 1] : [0, 1],
                                          ease: "easeInOut",
                                        }}
                                      >
                                        {isCorrectReveal ? (
                                          <motion.span
                                            aria-hidden
                                            className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/35 blur-2xl"
                                            initial={{ scale: 0.3, opacity: 0 }}
                                            animate={{ scale: 1.15, opacity: [0, 0.55, 0] }}
                                            transition={{ duration: 0.85, ease: "easeIn" }}
                                          />
                                        ) : null}
                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-violet-500 opacity-50">
                                          {optionKey}
                                        </span>
                                        <p className="pr-8 text-3xl font-bold leading-tight">{option}</p>
                                      </motion.div>
                                    )
                                  })}
                                </div>

                              </motion.div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-3xl bg-white/5 border border-dashed border-white/10 p-20">
                            <p className="text-slate-400 text-xl">اختر سؤالاً من اللوحة للبدء</p>
                          </div>
                        )}

                        <div className="pt-6">
                          <Button
                            type="button"
                            className={`${HOST_ACTION_BUTTON_CLASS} h-20 w-full rounded-3xl text-2xl`}
                            disabled={Boolean(busyAction) || !canAdvanceFromQuestionModal}
                            onClick={() => void handleQuestionModalExit()}
                          >
                            السؤال التالي
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : null}

        {room && stage === "celebration" ? (
          <section className="party-surface-strong rounded-3xl p-6 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-100/85">Celebration</p>
            <h2 className="mt-2 text-5xl font-black text-amber-100">انتهت اللعبة</h2>

            {winningSummary ? (
              <>
                <p className="mt-3 text-2xl text-slate-100">
                  {winningSummary.tied.length > 1
                    ? "تعادل بين الفرق!"
                    : `الفائز: ${winningSummary.top.name} برصيد ${winningSummary.top.score} نقطة`}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {winningSummary.sorted.map((team) => {
                    const tone = getTeamTone(team.teamId)
                    return (
                      <article key={team.teamId} className={`rounded-2xl border p-4 ${tone.border} ${tone.bg}`}>
                        <p className={`text-xl ${tone.text}`}>{team.name}</p>
                        <p className="mt-1 text-5xl font-black">{team.score}</p>
                      </article>
                    )
                  })}
                </div>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                disabled={Boolean(busyAction) || !canStartTrivia}
                onClick={() => void handleStartTrivia()}
              >
                الانتقال للعبة التالية
              </Button>
              <Button
                type="button"
                className={`${HOST_ACTION_BUTTON_CLASS} px-8 text-lg`}
                disabled={Boolean(busyAction) || !canEndSession}
                onClick={() => void handleEndSession()}
              >
                إنهاء الفعالية
              </Button>
            </div>
          </section>
        ) : null}
      </main>

      <div className="fixed bottom-4 left-[max(0.375rem,calc((100vw-1820px)/2-3.25rem))] z-30">
        <div className="flex flex-col gap-2">
          {room ? (
            <div className="group relative">
              <button
                type="button"
                onClick={() => void handleEndSession()}
                aria-label="إنهاء الفعالية"
                title="إنهاء الفعالية"
                disabled={Boolean(busyAction) || !canEndSession}
                className={HOST_END_ICON_BUTTON_CLASS}
              >
                <Power className="size-5" />
              </button>
              <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-black/80 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                إنهاء الفعالية
              </span>
            </div>
          ) : null}

          <div className="group relative">
            <button
              type="button"
              onClick={handleLogout}
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
              className={HOST_LOGOUT_ICON_BUTTON_CLASS}
            >
              <LogOut className="size-5" />
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-black/80 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              تسجيل الخروج
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {notice ? (
          <motion.div
            key={notice}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="party-status-success fixed bottom-4 right-4 z-40 max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-2xl"
            role="status"
            aria-live="polite"
          >
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>

    </div >
  )
}
