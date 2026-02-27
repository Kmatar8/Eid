"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react"

import FireworksBackgroundDemo from "@/components/fireworks-demo"
import { Button } from "@/components/ui/button"
import { FireworksBackground } from "@/components/ui/fireworks"
import { FeedbackOverlay } from "@/components/ui/feedback-animations"
import { LiveApiError, createRoom, getRoomState, sendAction } from "@/lib/client/live-api"
import {
  clearHostRoomId,
  clearHostSession,
  getHostRoomId,
  getHostToken,
  getHostUsername,
  setHostRoomId,
} from "@/lib/client/live-session"
import type { ClientActionType } from "@/lib/server/protocol-v1"
import type { RoomSnapshot } from "@/lib/server/types"

const POLL_MS = 1500
const CLOCK_TICK_MS = 300

type HostStage = "lobby" | "overview" | "trivia" | "celebration"

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
    bg: "bg-pink-500/10",
    chip: "bg-pink-500/20 text-pink-100 border-pink-300/40",
  },
  team_b: {
    border: "border-cyan-300/50",
    text: "text-cyan-100",
    bg: "bg-cyan-500/10",
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

function getTeamTone(teamId: string | null | undefined): TeamTone {
  if (!teamId) {
    return {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/5",
      chip: "bg-white/10 text-slate-100 border-white/20",
    }
  }

  return (
    TEAM_TONES[teamId] ?? {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/5",
      chip: "bg-white/10 text-slate-100 border-white/20",
    }
  )
}

function scoreBadge(score: number) {
  return score >= 0 ? `+${score}` : `${score}`
}

function remainingSeconds(targetTs: number | null, nowTs: number) {
  if (!targetTs) {
    return 0
  }
  return Math.max(0, Math.ceil((targetTs - nowTs) / 1000))
}

export default function HostStagePage() {
  const router = useRouter()

  const [hostToken, setHostTokenState] = useState<string | null>(() => getHostToken())
  const [hostUsername] = useState(() => getHostUsername() ?? "Host")
  const [roomId, setRoomId] = useState<string | null>(() => getHostRoomId())
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [isBootstrappingRoom, setIsBootstrappingRoom] = useState(false)
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null)
  const [dropTargetTeamId, setDropTargetTeamId] = useState<string | null>(null)
  const [showTriviaRulesModal, setShowTriviaRulesModal] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<"correct" | "wrong" | null>(null)

  useEffect(() => {
    if (!hostToken) {
      router.replace("/host/login")
    }
  }, [hostToken, router])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now())
    }, CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (room?.trivia?.phase === "answer_reveal" && room?.trivia.lastResult) {
      const { reason, wasCorrect } = room.trivia.lastResult
      if (reason !== "no_buzz" && reason !== "host_skip") {
        setFeedbackState(wasCorrect ? "correct" : "wrong")
      }
    }
  }, [room?.trivia?.phase, room?.trivia?.lastResult])

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

  const refreshState = useCallback(async () => {
    if (!hostToken || !roomId) {
      return
    }

    try {
      const response = await getRoomState(roomId, hostToken)
      setRoom(response.payload.room)
      setError(null)
    } catch (requestError) {
      if (
        requestError instanceof LiveApiError &&
        (requestError.code === "ROOM_NOT_FOUND" || requestError.code === "HOST_ROOM_MISMATCH")
      ) {
        clearHostRoomId()
        setRoomId(null)
        setRoom(null)
        return
      }

      setError(toErrorMessage(requestError))
    }
  }, [hostToken, roomId])

  const bootstrapRoom = useCallback(async () => {
    if (!hostToken || roomId || isBootstrappingRoom) {
      return
    }

    setIsBootstrappingRoom(true)
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
    } finally {
      setIsBootstrappingRoom(false)
    }
  }, [hostToken, isBootstrappingRoom, roomId])

  useEffect(() => {
    if (!hostToken) {
      return
    }

    if (!roomId) {
      void bootstrapRoom()
      return
    }

    void refreshState()
  }, [bootstrapRoom, hostToken, refreshState, roomId])

  useEffect(() => {
    if (!hostToken || !roomId) {
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
  }, [hostToken, refreshState, roomId])

  const runAction = useCallback(
    async (type: ClientActionType, payload?: Record<string, unknown>) => {
      if (!hostToken || !roomId) {
        throw new LiveApiError(401, "UNAUTHORIZED", "Host session is missing")
      }

      setBusyAction(type)
      setError(null)
      setNotice(null)

      try {
        const ack = await sendAction(roomId, hostToken, type, payload)
        setRoom(ack.payload.room)
        return ack.payload.room
      } finally {
        setBusyAction(null)
      }
    },
    [hostToken, roomId]
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

  const handleDropOnTeam = useCallback(
    async (teamId: string, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const draggedPlayerId = event.dataTransfer.getData("text/plain") || draggingPlayerId
      setDropTargetTeamId(null)
      setDraggingPlayerId(null)

      if (!draggedPlayerId) {
        return
      }

      await assignPlayer(draggedPlayerId, teamId)
    },
    [assignPlayer, draggingPlayerId]
  )

  const handleStartSession = useCallback(async () => {
    if (!hostToken || !roomId) {
      return
    }

    setBusyAction("host.prepareSession")
    setError(null)
    setNotice(null)

    try {
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

      setNotice("تم تثبيت الفرق. استعرض القواعد ثم ابدأ لوحة الجيوباردي.")
      await refreshState()
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    } finally {
      setBusyAction(null)
    }
  }, [hostToken, refreshState, roomId])

  const handleStartTriviaFromModal = useCallback(async () => {
    setShowTriviaRulesModal(false)
    try {
      await runAction("host.startTrivia")
      setNotice("بدأت لوحة الجيوباردي. الفريق الحالي يختار الفئة والنقاط.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

  const handleSelectTriviaClue = useCallback(
    async (questionId: string) => {
      try {
        await runAction("host.selectTriviaClue", { questionId })
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
      await runAction("host.endSession")
      setNotice("تم إنهاء الجلسة بنجاح.")
    } catch (requestError) {
      setError(toErrorMessage(requestError))
    }
  }, [runAction])

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

  const canSelectClue = trivia?.status === "in_progress" && trivia.phase === "board_turn"
  const isCountdownPhase = trivia?.phase === "countdown"
  const isQuestionRevealed =
    trivia?.phase === "buzzer_open" || trivia?.phase === "answer_active" || trivia?.phase === "answer_reveal"

  const boardRowIndexes = useMemo(() => {
    const maxRows = Math.max(...(trivia?.board ?? []).map((category) => category.clues.length), 0)
    return Array.from({ length: maxRows }, (_, index) => index)
  }, [trivia?.board])

  const liveHeadline = useMemo(() => {
    if (!trivia || trivia.status !== "in_progress") {
      return "في انتظار بدء لوحة الجيوباردي."
    }

    if (trivia.phase === "board_turn") {
      const teamName = currentTurnTeam?.name ?? "الفريق الحالي"
      const pickerName = currentPicker?.displayName ?? "لاعب عشوائي"
      return `${teamName} يختار الآن. اللاعب المحدد للدور: ${pickerName}`
    }

    if (trivia.phase === "countdown") {
      return `سيتم كشف السؤال بعد ${countdownSeconds} ثوانٍ.`
    }

    if (trivia.phase === "buzzer_open") {
      return `البازر مفتوح للجميع. أول ضغطة خلال ${buzzSeconds} ثانية تحسم الإجابة.`
    }

    if (trivia.phase === "answer_active") {
      const playerName = responderPlayer?.displayName ?? "لاعب غير معروف"
      const teamName = responderTeam?.name ?? "فريق غير معروف"
      return `السؤال للاعب ${playerName} من ${teamName}. وقت الإجابة ${answerSeconds} ثانية.`
    }

    if (trivia.phase === "answer_reveal" && trivia.lastResult) {
      const teamName = room?.teams.find((team) => team.teamId === trivia.lastResult?.awardedTeamId)?.name ?? "الفريق"
      if (trivia.lastResult.reason === "no_buzz") {
        return "لم يضغط أحد البازر. لا توجد نقاط لهذا السؤال."
      }
      if (trivia.lastResult.reason === "host_skip") {
        return "تم تخطي السؤال بواسطة المضيف."
      }
      if (trivia.lastResult.wasCorrect) {
        return `إجابة صحيحة. ${teamName} كسب ${scoreBadge(trivia.lastResult.awardedPoints)} نقاط.`
      }
      return `إجابة خاطئة. ${teamName} خسر ${Math.abs(trivia.lastResult.awardedPoints)} نقاط.`
    }

    return "استمروا في اللعب."
  }, [
    answerSeconds,
    countdownSeconds,
    currentPicker?.displayName,
    currentTurnTeam?.name,
    responderPlayer?.displayName,
    responderTeam?.name,
    room?.teams,
    trivia,
    buzzSeconds,
  ])

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

  return (
    <div className="relative min-h-screen overflow-hidden text-foreground">
      <FeedbackOverlay currentStatus={feedbackState} onComplete={() => setFeedbackState(null)} />
      <FireworksBackground population={2} particleSpeed={3} className="absolute inset-0 z-0 opacity-65" />
      <FireworksBackgroundDemo population={2} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,var(--festive-glow),transparent_52%),linear-gradient(160deg,var(--background)_0%,var(--secondary)_48%,var(--background)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[size:56px_56px]" style={{ backgroundImage: 'linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)' }} />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-[1700px] px-4 pb-28 pt-5 sm:px-8">
        {error ? <p className="mb-3 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        {notice ? <p className="mb-3 rounded-xl bg-emerald-500/20 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}

        {!room ? (
          <section className="rounded-3xl border border-white/20 bg-glass-bg p-10 text-center backdrop-blur-xl">
            <p className="text-lg text-slate-100">
              {isBootstrappingRoom ? "جارٍ تجهيز الغرفة..." : "في انتظار بيانات الغرفة..."}
            </p>
          </section>
        ) : null}

        {room && stage === "lobby" ? (
          <section className="grid gap-4 xl:grid-cols-[37rem_1fr]">
            <article className="rounded-3xl border border-white/20 bg-glass-bg p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Join QR</p>
              <h2 className="mt-2 text-3xl font-bold">امسح الرمز للانضمام</h2>
              <p className="mt-2 text-base text-slate-200">
                امسح QR من جوال اللاعب ثم أدخل الاسم. استمر في توزيع اللاعبين بين الفريقين أثناء الانضمام.
              </p>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white p-3">
                {joinQrUrl ? (
                  <img src={joinQrUrl} alt="Room join QR code" className="mx-auto h-auto w-full rounded-xl" />
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                    QR غير متاح
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-white/15 bg-glass-bg p-3 text-sm">
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
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-lg font-bold text-slate-950"
                disabled={Boolean(busyAction) || room.playerCount === 0}
                onClick={() => void handleStartSession()}
              >
                {busyAction === "host.prepareSession" ? "جاري تجهيز الفرق..." : "ابدأ الفعالية"}
              </Button>
            </article>

            <article className="space-y-4 rounded-3xl border border-white/20 bg-glass-bg p-5 backdrop-blur-xl">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Players</p>
                <h2 className="mt-2 text-3xl font-bold">اللاعبون المنضمون</h2>
                <p className="mt-2 text-base text-slate-200">اسحب اللاعبين إلى أعمدة الفرق أو استخدم أزرار الإسناد السريعة.</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {room.players.length === 0 ? (
                  <p className="col-span-full rounded-xl border border-white/15 bg-glass-bg p-4 text-sm text-slate-300">
                    لا يوجد لاعبين بعد. انتظر الانضمامات عبر QR.
                  </p>
                ) : null}

                {room.players.map((player) => {
                  const teamId = assignmentByPlayer.get(player.playerId) ?? null
                  const tone = getTeamTone(teamId)
                  const teamLabel = teamId === "team_a" ? "Team A" : teamId === "team_b" ? "Team B" : "غير مخصص"

                  return (
                    <article
                      key={player.playerId}
                      draggable
                      onDragStart={(event) => {
                        setDraggingPlayerId(player.playerId)
                        event.dataTransfer.setData("text/plain", player.playerId)
                      }}
                      onDragEnd={() => {
                        setDraggingPlayerId(null)
                        setDropTargetTeamId(null)
                      }}
                      className={`rounded-2xl border p-3 ${tone.border} ${tone.bg}`}
                    >
                      <p className="text-lg font-semibold">{player.displayName}</p>
                      <p className="mt-1 text-xs text-slate-300">آخر نشاط: {new Date(player.lastSeenAt).toLocaleTimeString()}</p>
                      <p className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs ${tone.chip}`}>{teamLabel}</p>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-lg border border-pink-300/40 bg-pink-500/15 px-2 py-1 text-xs text-pink-100 hover:bg-pink-500/25"
                          onClick={() => void assignPlayer(player.playerId, "team_a")}
                        >
                          Team A
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded-lg border border-cyan-300/40 bg-cyan-500/15 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/25"
                          onClick={() => void assignPlayer(player.playerId, "team_b")}
                        >
                          Team B
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {room.teams.map((team) => {
                  const tone = getTeamTone(team.teamId)
                  const teamPlayers = team.teamId === "team_a" ? playersByTeam.team_a : playersByTeam.team_b
                  const isDropActive = dropTargetTeamId === team.teamId

                  return (
                    <div
                      key={team.teamId}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDropTargetTeamId(team.teamId)
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault()
                        setDropTargetTeamId(team.teamId)
                      }}
                      onDragLeave={() => setDropTargetTeamId(null)}
                      onDrop={(event) => void handleDropOnTeam(team.teamId, event)}
                      className={`min-h-52 rounded-2xl border-2 p-4 transition-all ${tone.border} ${tone.bg} ${isDropActive ? "ring-2 ring-white/30" : ""
                        }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className={`text-xl font-bold ${tone.text}`}>{team.name}</p>
                        <p className="text-sm text-slate-200">{teamPlayers.length} لاعب</p>
                      </div>

                      <div className="space-y-2">
                        {teamPlayers.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-white/25 p-3 text-sm text-slate-300">
                            اسحب لاعبًا إلى هنا
                          </p>
                        ) : null}

                        {teamPlayers.map((player) => (
                          <div
                            key={`${team.teamId}-${player.playerId}`}
                            draggable
                            onDragStart={(event) => {
                              setDraggingPlayerId(player.playerId)
                              event.dataTransfer.setData("text/plain", player.playerId)
                            }}
                            onDragEnd={() => {
                              setDraggingPlayerId(null)
                              setDropTargetTeamId(null)
                            }}
                            className="rounded-xl border border-white/20 bg-glass-bg px-3 py-2 text-sm"
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

        {room && stage === "overview" ? (
          <section className="rounded-3xl border border-white/20 bg-glass-bg p-6 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Game Overview</p>
            <h2 className="mt-2 text-4xl font-bold">قواعد الجيوباردي قبل البداية</h2>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/20 bg-white/5 p-4">
                <h3 className="text-2xl font-bold">آلية اللعب</h3>
                <ul className="mt-3 space-y-2 text-base text-slate-200">
                  <li>1. كل دور لفريق واحد لاختيار الفئة والنقاط.</li>
                  <li>2. بعد الاختيار يبدأ عد تنازلي 5 ثوانٍ قبل كشف السؤال.</li>
                  <li>3. البازر مفتوح للجميع لمدة 20 ثانية.</li>
                  <li>4. أول لاعب يضغط البازر هو الوحيد الذي يرى الخيارات ويجيب.</li>
                </ul>
              </article>
              <article className="rounded-2xl border border-white/20 bg-white/5 p-4">
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
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 text-lg font-bold text-slate-950"
                disabled={Boolean(busyAction)}
                onClick={() => setShowTriviaRulesModal(true)}
              >
                ابدأ لعبة الجيوباردي
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleEndSession()}>
                إنهاء الجلسة
              </Button>
            </div>
          </section>
        ) : null}

        {room && stage === "trivia" ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {room.teams.map((team) => {
                const tone = getTeamTone(team.teamId)
                return (
                  <article key={team.teamId} className={`rounded-2xl border p-4 ${tone.border} ${tone.bg}`}>
                    <p className={`text-xl font-semibold ${tone.text}`}>{team.name}</p>
                    <p className="mt-1 text-6xl font-black leading-none">{team.score}</p>
                  </article>
                )
              })}
            </div>

            <article className={`rounded-3xl border p-5 ${currentTone.border} ${currentTone.bg}`}>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-200">Live Status</p>
              <h2 className="mt-2 text-3xl font-bold leading-tight">{liveHeadline}</h2>
              <p className="mt-2 text-base text-slate-200">
                تم استخدام {trivia?.questionIndex ?? 0} من {trivia?.totalQuestions ?? 0} سؤال.
              </p>
            </article>

            <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
              <article className="rounded-3xl border border-white/20 bg-glass-bg p-4 backdrop-blur-xl">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Jeopardy Board</p>
                    <h3 className="mt-1 text-2xl font-bold">اختر فئة وقيمة النقاط</h3>
                  </div>
                  <p className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-slate-100">
                    المتبقي: {trivia?.remainingQuestions ?? 0}
                  </p>
                </div>

                <div className="grid grid-cols-6 gap-2">
                  {(trivia?.board ?? []).map((category) => (
                    <div
                      key={`header-${category.categoryId}`}
                      className="rounded-xl border border-white/20 bg-white/10 px-2 py-3 text-center text-sm font-semibold leading-tight text-slate-100"
                    >
                      {category.name}
                    </div>
                  ))}

                  {boardRowIndexes.map((rowIndex) =>
                    (trivia?.board ?? []).map((category) => {
                      const clue = category.clues[rowIndex]
                      if (!clue) {
                        return <div key={`empty-${category.categoryId}-${rowIndex}`} className="h-16" />
                      }

                      const isSelected = clue.questionId === trivia?.selectedClue?.questionId
                      const isUsed = clue.used
                      return (
                        <button
                          key={`${category.categoryId}-${clue.questionId}`}
                          type="button"
                          disabled={Boolean(busyAction) || !canSelectClue || isUsed}
                          onClick={() => void handleSelectTriviaClue(clue.questionId)}
                          className={`h-16 rounded-xl border text-lg font-black transition ${isUsed
                            ? "border-white/10 bg-glass-bg text-slate-500"
                            : "border-pink-300/45 bg-pink-500/15 text-pink-100 hover:bg-pink-500/30"
                            } ${isSelected ? "ring-2 ring-white/60" : ""}`}
                        >
                          {isUsed ? "تم" : clue.points}
                        </button>
                      )
                    })
                  )}
                </div>
              </article>

              <article className="space-y-4 rounded-3xl border border-white/20 bg-glass-bg p-4 backdrop-blur-xl">
                <div className={`rounded-2xl border p-4 ${currentTone.border} ${currentTone.bg}`}>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Turn Context</p>
                  <p className="mt-2 text-lg font-semibold">الفريق صاحب الدور: {currentTurnTeam?.name ?? "غير محدد"}</p>
                  <p className="mt-1 text-sm text-slate-200">لاعب الاختيار: {currentPicker?.displayName ?? "غير محدد"}</p>
                  <p className="mt-1 text-sm text-slate-200">المجيب الحالي: {responderPlayer?.displayName ?? "لا يوجد بعد"}</p>
                </div>

                {selectedClue ? (
                  <div className={`rounded-2xl border p-4 ${currentTone.border} ${currentTone.bg}`}>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Question Window</p>
                    <p className="mt-2 text-sm text-slate-200">
                      {selectedClue.categoryName} | {selectedClue.points} نقطة
                    </p>

                    {isCountdownPhase ? (
                      <div className="mt-4 rounded-2xl border border-white/30 bg-glass-bg p-5 text-center">
                        <p className="text-sm text-slate-200">استعدوا... السؤال سيظهر حالًا</p>
                        <p className="mt-2 text-8xl font-black leading-none text-violet-200 animate-pulse">
                          {countdownSeconds}
                        </p>
                      </div>
                    ) : null}

                    {isQuestionRevealed ? (
                      <>
                        <p className="mt-2 text-lg font-semibold leading-relaxed">{selectedClue.prompt}</p>
                        <div className="mt-3 grid gap-2">
                          {selectedClue.options.map((option, index) => (
                            <div
                              key={`${selectedClue.questionId}-${index}`}
                              className="rounded-lg border border-white/20 bg-glass-bg px-3 py-2 text-sm"
                            >
                              <span className="font-bold">{["A", "B", "C", "D"][index]}.</span> {option}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    لم يتم اختيار سؤال بعد.
                  </p>
                )}

                {trivia?.lastResult ? (
                  <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Result</p>
                    <p className="mt-2 text-sm text-slate-100">
                      الإجابة الصحيحة: {trivia.lastResult.correctOption}
                      {trivia.lastResult.answeredOption ? ` | إجابة اللاعب: ${trivia.lastResult.answeredOption}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-slate-100">
                      التغيير: {scoreBadge(trivia.lastResult.awardedPoints)} ({trivia.lastResult.reason})
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(busyAction) || !canSelectAnotherResponder}
                    onClick={() => void handleSelectAnotherResponder()}
                  >
                    {trivia?.phase === "board_turn" ? "اختيار لاعب آخر للدور" : "اختيار مجيب آخر"}
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      Boolean(busyAction) ||
                      trivia?.status !== "in_progress" ||
                      (trivia?.phase !== "answer_reveal" &&
                        trivia?.phase !== "countdown" &&
                        trivia?.phase !== "buzzer_open" &&
                        trivia?.phase !== "answer_active")
                    }
                    onClick={() => void handleAdvanceTurn()}
                  >
                    {trivia?.phase === "answer_reveal" ? "الدور التالي" : "تخطي السؤال"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleEndSession()}>
                    إنهاء الجلسة
                  </Button>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {room && stage === "celebration" ? (
          <section className="rounded-3xl border border-white/20 bg-glass-bg p-6 text-center backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Celebration</p>
            <h2 className="mt-2 text-5xl font-black text-amber-100">انتهت لعبة الجيوباردي</h2>

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
                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 text-lg font-bold text-slate-950"
                disabled={Boolean(busyAction)}
                onClick={() => setShowTriviaRulesModal(true)}
              >
                الانتقال للعبة التالية
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleEndSession()}>
                إنهاء الفعالية
              </Button>
            </div>
          </section>
        ) : null}
      </main>

      <div className="fixed bottom-3 left-0 right-0 z-30 px-4">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-glass-bg px-4 py-3 backdrop-blur-xl">
          <p className="text-xs text-slate-200 sm:text-sm">
            {hostUsername} | الغرفة: {roomId ?? "..."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-sm text-amber-200 underline-offset-2 hover:underline">
              العودة للهبوط
            </Link>
            <Button type="button" variant="outline" onClick={() => void refreshState()} disabled={!roomId}>
              تحديث
            </Button>
            <Button type="button" variant="destructive" onClick={handleLogout}>
              تسجيل خروج
            </Button>
          </div>
        </div>
      </div>

      {
        showTriviaRulesModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-glass-bg/90 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-3xl border border-white/20 bg-slate-950/95 p-6 text-white shadow-2xl">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100/80">Jeopardy Rules</p>
              <h3 className="mt-2 text-3xl font-bold">قواعد لعبة الجيوباردي</h3>
              <ul className="mt-4 space-y-2 text-base text-slate-200">
                <li>1. لديك 6 فئات وكل فئة فيها 5 أسئلة بقيم 10 إلى 50.</li>
                <li>2. الدور يتناوب بين الفريقين لاختيار الفئة والقيمة.</li>
                <li>3. بعد الاختيار يبدأ عدّاد 5 ثوانٍ ثم يفتح البازر 20 ثانية.</li>
                <li>4. أول لاعب يضغط البازر هو الوحيد الذي يجيب من جهازه.</li>
                <li>5. الإجابة الصحيحة تضيف النقاط، والخاطئة تخصم نفس القيمة.</li>
              </ul>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowTriviaRulesModal(false)}>
                  إلغاء
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 font-bold text-slate-950"
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleStartTriviaFromModal()}
                >
                  إغلاق وبدء اللعبة
                </Button>
              </div>
            </div>
          </div>
        ) : null
      }
    </div >
  )
}
