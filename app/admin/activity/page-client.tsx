"use client"

import { useEffect, useState } from "react"

import {
  Activity,
  BadgeAlert,
  Gamepad2,
  Gauge,
  House,
  Lock,
  RefreshCw,
  Router,
  ShieldCheck,
  Trash2,
  Users,
  Waves,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const SESSION_TOKEN_KEY = "hroof:activity-monitor:token"
const DEFAULT_HOST_PRESENCE_MS = 30_000
const DEFAULT_CONTROLLER_PRESENCE_MS = 45_000
const DEFAULT_INTERVAL_MS = 5_000

type MonitorSummary = {
  hosts: {
    withActiveRoomAssignment: number
    present: number
    stale: number
  }
  rooms: {
    assigned: number
    active: number
    missing: number
    inactive: number
    byState: Record<string, number>
    byActiveGame: Record<string, number>
  }
  controllers: {
    joinedInActiveRooms: number
    activeInActiveRooms: number
    staleInActiveRooms: number
  }
}

type MonitorRoom = {
  roomId: string
  hostId: string
  hostUsername: string
  roomFound: boolean
  roomActive: boolean
  state: string | null
  activeGame: string | null
  version: number | null
  updatedAt: number | null
  expiresAt: number | null
  hostLastSeenAt: number | null
  hostHeartbeatAgeMs: number | null
  hostPresent: boolean
  joinedControllers: number
  activeControllers: number
  staleControllers: number
}

type MonitorPayload = {
  observedAt: number
  thresholds: {
    hostPresenceMs: number
    controllerPresenceMs: number
  }
  summary: MonitorSummary
  rooms: MonitorRoom[]
}

type ApiErrorPayload = {
  error?: {
    code?: string
    message?: string
  }
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) {
    return "-"
  }

  if (ageMs < 1000) {
    return `${ageMs}ms`
  }

  const totalSeconds = Math.floor(ageMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return "-"
  }

  return new Date(value).toLocaleString()
}

function parsePositiveInt(raw: string, fallback: number) {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function getErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const parsed = payload as ApiErrorPayload
    if (parsed.error?.code || parsed.error?.message) {
      return `${parsed.error.code ?? "REQUEST_FAILED"}: ${parsed.error.message ?? `Request failed (${status})`}`
    }
  }

  return `Request failed (${status})`
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Waves
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <Card className={`border-white/15 bg-white/8 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] ${tone}`}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardDescription className="text-white/70">{label}</CardDescription>
            <CardTitle className="mt-2 text-4xl font-black tracking-tight">{value}</CardTitle>
          </div>
          <div className="rounded-2xl border border-white/15 bg-black/20 p-3">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-white/72">{detail}</p>
      </CardContent>
    </Card>
  )
}

function SummaryList({
  title,
  entries,
}: {
  title: string
  entries: [string, number][]
}) {
  return (
    <Card className="border-white/15 bg-white/8 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
      <CardHeader>
        <CardTitle className="text-base font-bold">{title}</CardTitle>
        <CardDescription className="text-white/70">
          Snapshot buckets derived from the current in-memory runtime state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-white/60">No active values in this snapshot.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {entries.map(([name, count]) => (
              <span
                key={name}
                className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-semibold text-white/85"
              >
                {name}: {count}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ActivityMonitorPageClient() {
  const [emailInput, setEmailInput] = useState("")
  const [passwordInput, setPasswordInput] = useState("")
  const [hostPresenceInput, setHostPresenceInput] = useState(String(DEFAULT_HOST_PRESENCE_MS))
  const [controllerPresenceInput, setControllerPresenceInput] = useState(String(DEFAULT_CONTROLLER_PRESENCE_MS))
  const [intervalInput, setIntervalInput] = useState(String(DEFAULT_INTERVAL_MS))
  const [watchEnabled, setWatchEnabled] = useState(true)
  const [appliedAuth, setAppliedAuth] = useState("")
  const [appliedHostPresenceMs, setAppliedHostPresenceMs] = useState(DEFAULT_HOST_PRESENCE_MS)
  const [appliedControllerPresenceMs, setAppliedControllerPresenceMs] = useState(DEFAULT_CONTROLLER_PRESENCE_MS)
  const [appliedIntervalMs, setAppliedIntervalMs] = useState(DEFAULT_INTERVAL_MS)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [payload, setPayload] = useState<MonitorPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const savedToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY) ?? ""
    if (!savedToken) {
      return
    }

    try {
      const decoded = window.atob(savedToken)
      const [email, password] = decoded.split(":")
      if (email && password) {
        setEmailInput(email)
        setPasswordInput(password)
        setAppliedAuth(savedToken)
      }
    } catch {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY)
    }
  }, [])

  useEffect(() => {
    if (!appliedAuth) {
      return
    }

    const controller = new AbortController()
    const url = new URL("/api/admin/activity", window.location.origin)
    url.searchParams.set("hostPresenceMs", String(appliedHostPresenceMs))
    url.searchParams.set("controllerPresenceMs", String(appliedControllerPresenceMs))

    async function run() {
      setLoading(true)

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            authorization: `Basic ${appliedAuth}`,
          },
        })

        const body = (await response.json().catch(() => null)) as unknown
        if (!response.ok) {
          throw new Error(getErrorMessage(body, response.status))
        }

        setPayload(body as MonitorPayload)
        setError(null)
      } catch (requestError) {
        if (controller.signal.aborted) {
          return
        }

        setError(requestError instanceof Error ? requestError.message : "Failed to load activity snapshot")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      controller.abort()
    }
  }, [appliedControllerPresenceMs, appliedHostPresenceMs, appliedAuth, refreshNonce])

  useEffect(() => {
    if (!watchEnabled || !appliedAuth) {
      return
    }

    const intervalId = window.setInterval(() => {
      setRefreshNonce((current) => current + 1)
    }, appliedIntervalMs)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [appliedIntervalMs, appliedAuth, watchEnabled])

  const observedAtLabel = payload ? formatTimestamp(payload.observedAt) : "Waiting for first snapshot"
  const stateEntries = payload ? Object.entries(payload.summary.rooms.byState) : []
  const activeGameEntries = payload ? Object.entries(payload.summary.rooms.byActiveGame) : []

  function applySettings() {
    const nextHostPresenceMs = parsePositiveInt(hostPresenceInput, DEFAULT_HOST_PRESENCE_MS)
    const nextControllerPresenceMs = parsePositiveInt(controllerPresenceInput, DEFAULT_CONTROLLER_PRESENCE_MS)
    const nextIntervalMs = parsePositiveInt(intervalInput, DEFAULT_INTERVAL_MS)
    
    const email = emailInput.trim()
    const password = passwordInput.trim()
    const validCredentials = email.length > 0 && password.length > 0
    const authToken = validCredentials ? window.btoa(`${email}:${password}`) : ""

    setHostPresenceInput(String(nextHostPresenceMs))
    setControllerPresenceInput(String(nextControllerPresenceMs))
    setIntervalInput(String(nextIntervalMs))
    setAppliedHostPresenceMs(nextHostPresenceMs)
    setAppliedControllerPresenceMs(nextControllerPresenceMs)
    setAppliedIntervalMs(nextIntervalMs)
    setAppliedAuth(authToken)
    setPayload(null)
    setError(authToken ? null : "Enter admin email and password.")

    if (typeof window !== "undefined") {
      if (authToken) {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, authToken)
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_KEY)
      }
    }

    if (authToken) {
      setRefreshNonce((current) => current + 1)
    }
  }

  function clearToken() {
    setEmailInput("")
    setPasswordInput("")
    setAppliedAuth("")
    setPayload(null)
    setError(null)

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#09111f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_34%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.16),transparent_42%),linear-gradient(160deg,#07101d_0%,#111827_45%,#140d22_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/12 bg-white/7 shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-col gap-6 border-b border-white/10 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Runtime Operations</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Activity Monitor</h1>
              <p className="mt-3 max-w-2xl text-sm text-white/72 sm:text-base">
                Read-only runtime view for active hosts, rooms, and controllers. This page uses the same protected
                snapshot API as the CLI and never bypasses the existing bearer token check.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/70">Mode</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-50">
                  <ShieldCheck className="h-4 w-4" />
                  Read only
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">Observed</p>
                <p className="mt-2 text-sm font-semibold text-cyan-50">{observedAtLabel}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-100/70">Watcher</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-50">
                  <Activity className={`h-4 w-4 ${watchEnabled && appliedAuth ? "animate-pulse" : ""}`} />
                  {watchEnabled && appliedAuth ? `Polling every ${appliedIntervalMs}ms` : "Manual refresh"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 lg:grid-cols-[1.5fr_1fr]">
            <Card className="border-white/15 bg-black/20 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lock className="h-5 w-5 text-cyan-200" />
                  Admin Login
                </CardTitle>
                <CardDescription className="text-white/70">
                  Enter the admin email and password. Your session is securely kept in this tab.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-2 text-sm">
                    <span className="text-white/72">Admin Email</span>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      placeholder="Admin email"
                      className="h-11 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white placeholder:text-white/35"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-white/72">Password</span>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      placeholder="Password"
                      className="h-11 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white placeholder:text-white/35"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-white/72">Host presence window (ms)</span>
                    <input
                      inputMode="numeric"
                      value={hostPresenceInput}
                      onChange={(event) => setHostPresenceInput(event.target.value)}
                      className="h-11 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-white/72">Controller presence window (ms)</span>
                    <input
                      inputMode="numeric"
                      value={controllerPresenceInput}
                      onChange={(event) => setControllerPresenceInput(event.target.value)}
                      className="h-11 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-white/72">Poll interval (ms)</span>
                    <input
                      inputMode="numeric"
                      value={intervalInput}
                      onChange={(event) => setIntervalInput(event.target.value)}
                      className="h-11 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={watchEnabled}
                      onChange={(event) => setWatchEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-400"
                    />
                    Auto-refresh when connected
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 bg-white/10 text-white hover:bg-white/18 hover:text-white"
                      onClick={() => setRefreshNonce((current) => current + 1)}
                      disabled={!appliedAuth || loading}
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      className="bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 font-bold text-slate-950 hover:brightness-105"
                      onClick={applySettings}
                    >
                      <Gauge className="h-4 w-4" />
                      Connect
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-white/78 hover:bg-white/10 hover:text-white"
                      onClick={clearToken}
                    >
                      <Trash2 className="h-4 w-4" />
                      Logout
                    </Button>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-400/25 bg-red-500/12 px-4 py-3 text-sm text-red-100">
                    <div className="flex items-center gap-2 font-semibold">
                      <BadgeAlert className="h-4 w-4" />
                      Monitor request failed
                    </div>
                    <p className="mt-2 text-red-50/90">{error}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-white/15 bg-black/20 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
              <CardHeader>
                <CardTitle className="text-lg">Source</CardTitle>
                <CardDescription className="text-white/70">
                  This page reads the same protected API used by the CLI monitor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-white/75">
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Endpoint</p>
                  <p className="mt-2 font-mono text-xs text-cyan-100">GET /api/admin/activity</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Thresholds</p>
                  <p className="mt-2">
                    Hosts are considered present within {appliedHostPresenceMs}ms. Controllers are considered active
                    within {appliedControllerPresenceMs}ms.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Session storage</p>
                  <p className="mt-2">
                    Stored in `sessionStorage` for this tab only. Logging out disconnects the page immediately.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={House}
            label="Hosts Present"
            value={
              payload
                ? `${payload.summary.hosts.present}/${payload.summary.hosts.withActiveRoomAssignment}`
                : "0/0"
            }
            detail={
              payload
                ? `${payload.summary.hosts.stale} host assignments are stale.`
                : "Connected host counts appear after the first successful snapshot."
            }
            tone="from-emerald-500/12"
          />
          <MetricCard
            icon={Router}
            label="Active Rooms"
            value={payload ? `${payload.summary.rooms.active}` : "0"}
            detail={
              payload
                ? `${payload.summary.rooms.inactive} inactive and ${payload.summary.rooms.missing} missing assignments.`
                : "Rooms are counted after the first snapshot."
            }
            tone="from-cyan-500/12"
          />
          <MetricCard
            icon={Users}
            label="Active Controllers"
            value={
              payload
                ? `${payload.summary.controllers.activeInActiveRooms}/${payload.summary.controllers.joinedInActiveRooms}`
                : "0/0"
            }
            detail={
              payload
                ? `${payload.summary.controllers.staleInActiveRooms} joined controllers are stale.`
                : "Controller presence is measured from room snapshots."
            }
            tone="from-violet-500/12"
          />
          <MetricCard
            icon={Gamepad2}
            label="Rooms In Play"
            value={payload ? `${stateEntries.length}` : "0"}
            detail={payload ? "State buckets with at least one active room in the current snapshot." : "Waiting for data."}
            tone="from-amber-500/12"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <SummaryList title="Active Room States" entries={stateEntries} />
          <SummaryList title="Active Games" entries={activeGameEntries} />
        </section>

        <section>
          <Card className="border-white/15 bg-white/8 text-white shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-xl font-black">Per-room breakdown</CardTitle>
                  <CardDescription className="text-white/70">
                    Use this table to explain the summary cards and spot stale host/controller presence quickly.
                  </CardDescription>
                </div>
                <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
                  {payload ? `${payload.rooms.length} rooms in snapshot` : "No snapshot yet"}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {payload?.rooms.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.18em] text-white/45">
                      <tr>
                        <th className="px-3">Room</th>
                        <th className="px-3">Host</th>
                        <th className="px-3">Status</th>
                        <th className="px-3">Game</th>
                        <th className="px-3">Heartbeat</th>
                        <th className="px-3">Controllers</th>
                        <th className="px-3">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.rooms.map((room) => (
                        <tr key={`${room.hostId}:${room.roomId || "missing"}`} className="rounded-2xl">
                          <td className="rounded-l-2xl border-y border-l border-white/10 bg-black/18 px-3 py-3 align-top">
                            <div className="font-mono text-xs text-cyan-100">{room.roomId || "missing"}</div>
                            <div className="mt-1 text-xs text-white/45">v{room.version ?? "-"}</div>
                          </td>
                          <td className="border-y border-white/10 bg-black/18 px-3 py-3 align-top">
                            <div className="font-semibold text-white">{room.hostUsername}</div>
                            <div className="mt-1 font-mono text-xs text-white/45">{room.hostId}</div>
                          </td>
                          <td className="border-y border-white/10 bg-black/18 px-3 py-3 align-top">
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  room.roomActive
                                    ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-100"
                                    : room.roomFound
                                      ? "border-amber-400/25 bg-amber-500/12 text-amber-100"
                                      : "border-red-400/25 bg-red-500/12 text-red-100"
                                }`}
                              >
                                {room.roomActive ? "active" : room.roomFound ? "inactive" : "missing"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs font-semibold text-white/80">
                                {room.state ?? "-"}
                              </span>
                            </div>
                            <div className="mt-2 text-xs text-white/50">expires {formatTimestamp(room.expiresAt)}</div>
                          </td>
                          <td className="border-y border-white/10 bg-black/18 px-3 py-3 align-top">
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/12 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                              {room.activeGame ?? "-"}
                            </span>
                          </td>
                          <td className="border-y border-white/10 bg-black/18 px-3 py-3 align-top">
                            <div
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                room.hostPresent
                                  ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-100"
                                  : "border-amber-400/25 bg-amber-500/12 text-amber-100"
                              }`}
                            >
                              {room.hostPresent ? "present" : "stale"}
                            </div>
                            <div className="mt-2 text-xs text-white/60">{formatAge(room.hostHeartbeatAgeMs)}</div>
                            <div className="mt-1 text-xs text-white/45">{formatTimestamp(room.hostLastSeenAt)}</div>
                          </td>
                          <td className="border-y border-white/10 bg-black/18 px-3 py-3 align-top">
                            <div className="font-semibold text-white">
                              {room.activeControllers}/{room.joinedControllers}
                            </div>
                            <div className="mt-1 text-xs text-white/55">{room.staleControllers} stale</div>
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-white/10 bg-black/18 px-3 py-3 align-top text-xs text-white/60">
                            {formatTimestamp(room.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/15 bg-black/15 px-6 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
                    <Waves className="h-6 w-6 text-cyan-200" />
                  </div>
                  <h2 className="mt-4 text-xl font-bold">No activity snapshot loaded</h2>
                  <p className="mt-2 text-sm text-white/65">
                    Connect with your admin credentials to view active hosts, rooms, and controllers on this deployment.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
