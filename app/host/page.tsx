"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react"

import FireworksBackgroundDemo from "@/components/fireworks-demo"
import { Button } from "@/components/ui/button"
import { FireworksBackground } from "@/components/ui/fireworks"
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

type HostStage = "lobby" | "overview" | "trivia" | "celebration"

type TeamTone = {
  border: string
  text: string
  bg: string
  chip: string
}

const TEAM_TONES: Record<string, TeamTone> = {
  team_a: {
    border: "border-amber-300/50",
    text: "text-amber-100",
    bg: "bg-amber-500/10",
    chip: "bg-amber-500/20 text-amber-100 border-amber-300/40",
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

function getTeamTone(teamId: string | null | undefined) {
  if (!teamId) {
    return {
      border: "border-white/20",
      text: "text-slate-100",
      bg: "bg-white/5",
      chip: "bg-white/10 text-slate-100 border-white/20",
    } satisfies TeamTone
  }

  return TEAM_TONES[teamId] ?? {
    border: "border-white/20",
    text: "text-slate-100",
    bg: "bg-white/5",
    chip: "bg-white/10 text-slate-100 border-white/20",
  }
}

function scoreBadge(score: number) {
  return score > 0 ? `+${score}` : `${score}`
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
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!hostToken) {
      router.replace("/host/login")
    }
  }, [hostToken, router])

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

    return `https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=18&data=${encodeURIComponent(joinUrl)}`
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

      setNotice("تم تثبيت الفرق. اعرض صفحة نظرة الألعاب وابدأ اللعبة الأولى.")
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
      setNotice("بدأت لعبة المعلومات. الأسئلة الآن على أجهزة اللاعبين.")
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

  const triviaTeam = room?.teams.find((team) => team.teamId === room?.trivia.currentTeamId) ?? null
  const responder = room?.trivia.currentResponderPlayerId
    ? playerById.get(room.trivia.currentResponderPlayerId) ?? null
    : null
  const currentTone = getTeamTone(triviaTeam?.teamId ?? null)

  const triviaBannerMessage = useMemo(() => {
    if (!room || room.trivia.status !== "in_progress") {
      return "في انتظار بدء لعبة المعلومات."
    }

    const teamName = triviaTeam?.name ?? "الفريق"
    const responderName = responder?.displayName ?? "لاعب غير محدد"

    if (room.trivia.phase === "question_active_primary_team") {
      return `السؤال لـ ${responderName} من ${teamName}`
    }

    if (room.trivia.phase === "question_active_steal_team") {
      return `${teamName} لديه فرصة سرقة النقاط. الدور الآن على ${responderName}`
    }

    if (room.trivia.phase === "answer_reveal" && room.trivia.lastResult) {
      return room.trivia.lastResult.wasCorrect
        ? `إجابة صحيحة. ${teamName} كسب ${scoreBadge(room.trivia.lastResult.awardedPoints)} نقاط`
        : "إجابة غير صحيحة. استعدوا للسؤال التالي."
    }

    return "استعدوا للسؤال القادم."
  }, [responder?.displayName, room, triviaTeam?.name])

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
    <div className="relative min-h-screen overflow-hidden text-white">
      <FireworksBackground population={2} particleSpeed={3} className="absolute inset-0 z-0 opacity-70" />
      <FireworksBackgroundDemo population={2} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_52%),linear-gradient(160deg,#0b1120_0%,#1f1b4b_48%,#0b1120_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-black/35 p-4 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">وضع المضيف - شاشة الفعالية</h1>
            <p className="mt-1 text-sm text-slate-200">
              {hostUsername} | الغرفة: {roomId ?? "جاري التحضير..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
        </header>

        {error ? <p className="mb-4 rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        {notice ? <p className="mb-4 rounded-xl bg-emerald-500/20 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}

        {!room ? (
          <section className="rounded-3xl border border-white/20 bg-black/40 p-10 text-center backdrop-blur-xl">
            <p className="text-lg text-slate-100">
              {isBootstrappingRoom ? "جارٍ تجهيز الغرفة..." : "في انتظار بيانات الغرفة..."}
            </p>
          </section>
        ) : null}

        {room && stage === "lobby" ? (
          <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <article className="rounded-3xl border border-white/20 bg-black/40 p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Join QR</p>
              <h2 className="mt-2 text-2xl font-semibold">امسح الرمز للانضمام</h2>
              <p className="mt-2 text-sm text-slate-200">
                افتح الكاميرا على جوال اللاعب، امسح الرمز، ثم أدخل الاسم للدخول مباشرة.
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

              <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-3 text-sm">
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
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-slate-950"
                disabled={Boolean(busyAction) || room.playerCount === 0}
                onClick={() => void handleStartSession()}
              >
                {busyAction === "host.prepareSession" ? "جاري تجهيز الفرق..." : "ابدأ الفعالية"}
              </Button>
            </article>

            <article className="space-y-4 rounded-3xl border border-white/20 bg-black/40 p-5 backdrop-blur-xl">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Players</p>
                <h2 className="mt-2 text-2xl font-semibold">اللاعبون المنضمون</h2>
                <p className="mt-2 text-sm text-slate-200">
                  اسحب أي لاعب وضعه داخل عمود الفريق المناسب. أزرار الإسناد السريعة متاحة أيضًا.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {room.players.length === 0 ? (
                  <p className="col-span-full rounded-xl border border-white/15 bg-black/30 p-4 text-sm text-slate-300">
                    لا يوجد لاعبين بعد. انتظر الانضمامات عبر QR.
                  </p>
                ) : null}

                {room.players.map((player) => {
                  const teamId = assignmentByPlayer.get(player.playerId) ?? null
                  const tone = getTeamTone(teamId)
                  const teamLabel =
                    teamId === "team_a" ? "Team A" : teamId === "team_b" ? "Team B" : "غير مخصص"

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
                      className={`rounded-2xl border p-3 backdrop-blur-sm ${tone.border} ${tone.bg}`}
                    >
                      <p className="font-semibold">{player.displayName}</p>
                      <p className="mt-1 text-xs text-slate-300">آخر نشاط: {new Date(player.lastSeenAt).toLocaleTimeString()}</p>
                      <p className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs ${tone.chip}`}>{teamLabel}</p>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="flex-1 rounded-lg border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/25"
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

              <div className="grid gap-3 md:grid-cols-2">
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
                      className={`min-h-48 rounded-2xl border-2 p-4 transition-all ${tone.border} ${tone.bg} ${
                        isDropActive ? "ring-2 ring-white/30" : ""
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className={`text-lg font-semibold ${tone.text}`}>{team.name}</p>
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
                            className="rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm"
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
          <section className="rounded-3xl border border-white/20 bg-black/40 p-6 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Game Overview</p>
            <h2 className="mt-2 text-3xl font-bold">قواعد الفعالية قبل بداية اللعبة</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <article className="rounded-2xl border border-white/20 bg-white/5 p-4">
                <h3 className="text-xl font-semibold">القواعد العامة</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  <li>1. اللاعب يجيب فقط عندما يظهر اسمه كالمجيب الحالي.</li>
                  <li>2. كل إجابة تُحسب مباشرة على لوحة النقاط.</li>
                  <li>3. الإجابة الخاطئة تفتح فرصة سرقة للفريق الآخر.</li>
                </ul>
              </article>
              <article className="rounded-2xl border border-white/20 bg-white/5 p-4">
                <h3 className="text-xl font-semibold">بداية اللعبة الأولى</h3>
                <p className="mt-3 text-sm text-slate-200">
                  عند الضغط على البدء ستظهر نافذة قواعد لعبة المعلومات. بعد إغلاقها يبدأ إرسال الأسئلة إلى أجهزة اللاعبين.
                </p>
              </article>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-slate-950"
                disabled={Boolean(busyAction)}
                onClick={() => setShowTriviaRulesModal(true)}
              >
                ابدأ اللعبة الأولى
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleEndSession()}>
                إنهاء الجلسة
              </Button>
            </div>
          </section>
        ) : null}

        {room && stage === "trivia" ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {room.teams.map((team) => {
                const tone = getTeamTone(team.teamId)
                return (
                  <article key={team.teamId} className={`rounded-2xl border p-4 ${tone.border} ${tone.bg}`}>
                    <p className={`text-sm ${tone.text}`}>{team.name}</p>
                    <p className="mt-1 text-5xl font-bold">{team.score}</p>
                  </article>
                )
              })}
            </div>

            <article className={`rounded-3xl border p-6 backdrop-blur-xl ${currentTone.border} ${currentTone.bg}`}>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-200">Trivia</p>
              <h2 className="mt-2 text-3xl font-bold">{triviaBannerMessage}</h2>
              <p className="mt-2 text-sm text-slate-200">
                السؤال {room.trivia.questionIndex + 1} من {room.trivia.totalQuestions}
              </p>

              {room.trivia.currentQuestion ? (
                <div className="mt-4 rounded-2xl border border-white/20 bg-black/35 p-4">
                  <p className="text-xl font-semibold leading-relaxed">{room.trivia.currentQuestion.prompt}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {room.trivia.currentQuestion.options.map((option, index) => (
                      <div key={`${room.trivia.currentQuestion?.id}-${index}`} className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm">
                        <span className="font-semibold">{["A", "B", "C", "D"][index]}.</span> {option}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-slate-200">
                  في انتظار ظهور السؤال الحالي.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={Boolean(busyAction) || room.trivia.status !== "in_progress"}
                  onClick={() => void runAction("host.nextQuestion").catch((requestError) => setError(toErrorMessage(requestError)))}
                >
                  السؤال التالي
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleEndSession()}>
                  إنهاء الجلسة
                </Button>
              </div>
            </article>
          </section>
        ) : null}

        {room && stage === "celebration" ? (
          <section className="rounded-3xl border border-white/20 bg-black/40 p-6 text-center backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/85">Celebration</p>
            <h2 className="mt-2 text-4xl font-extrabold text-amber-100">انتهت لعبة المعلومات</h2>

            {winningSummary ? (
              <>
                <p className="mt-3 text-xl text-slate-100">
                  {winningSummary.tied.length > 1
                    ? "تعادل بين الفرق!"
                    : `الفائز: ${winningSummary.top.name} برصيد ${winningSummary.top.score} نقطة`}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {winningSummary.sorted.map((team) => {
                    const tone = getTeamTone(team.teamId)
                    return (
                      <article key={team.teamId} className={`rounded-2xl border p-4 ${tone.border} ${tone.bg}`}>
                        <p className={`text-lg ${tone.text}`}>{team.name}</p>
                        <p className="mt-1 text-4xl font-bold">{team.score}</p>
                      </article>
                    )
                  })}
                </div>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-slate-950"
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

      {showTriviaRulesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-950/95 p-6 text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-100/80">Trivia Rules</p>
            <h3 className="mt-2 text-3xl font-bold">قواعد لعبة المعلومات</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              <li>1. السؤال يظهر لمجيب واحد محدد من الفريق الحالي.</li>
              <li>2. الإجابة الصحيحة للفريق الأساسي = 10 نقاط.</li>
              <li>3. إذا أخطأ الفريق الأساسي، يحصل الفريق الآخر على فرصة سرقة = 6 نقاط.</li>
              <li>4. بعد كل سؤال، المضيف ينتقل يدويًا إلى السؤال التالي.</li>
            </ul>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowTriviaRulesModal(false)}>
                إلغاء
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-slate-950"
                disabled={Boolean(busyAction)}
                onClick={() => void handleStartTriviaFromModal()}
              >
                إغلاق وبدء الأسئلة
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
