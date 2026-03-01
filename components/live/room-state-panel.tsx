import type { RoomSnapshot, RoomState } from "@/lib/server/types"

type RoomStatePanelProps = {
  room: RoomSnapshot
  highlightPlayerId?: string | null
}

function stateLabel(state: RoomState) {
  switch (state) {
    case "lobby_open":
      return "Lobby Open"
    case "lobby_locked":
      return "Lobby Locked"
    case "teams_ready":
      return "Teams Ready"
    case "game_live":
      return "Game Live"
    case "between_games":
      return "Between Games"
    case "paused_wait_host":
      return "Paused (Wait Host)"
    case "session_completed":
      return "Session Completed"
    case "expired":
      return "Expired"
    case "superseded":
      return "Superseded"
    default:
      return state
  }
}

function formatMs(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}

function optionLabel(index: number) {
  return ["A", "B", "C", "D"][index] ?? "?"
}

export default function RoomStatePanel({ room, highlightPlayerId }: RoomStatePanelProps) {
  const teamById = new Map(room.teams.map((team) => [team.teamId, team]))
  const playerTeam = new Map(room.teamAssignments.map((entry) => [entry.playerId, entry.teamId]))

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">State</p>
          <p className="mt-1 text-lg font-semibold">{stateLabel(room.state)}</p>
          <p className="mt-2 text-xs text-slate-400">Version: {room.version}</p>
        </article>
        <article className="rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Players</p>
          <p className="mt-1 text-lg font-semibold">{room.playerCount}</p>
          <p className="mt-2 text-xs text-slate-400">Updated: {formatMs(room.updatedAt)}</p>
        </article>
        <article className="rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Trivia</p>
          <p className="mt-1 text-lg font-semibold">{room.trivia.status}</p>
          <p className="mt-2 text-xs text-slate-400">Phase: {room.trivia.phase ?? "-"}</p>
        </article>
      </section>

      <section className="rounded-xl border border-white/20 bg-white/10 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Haraj</p>
        <p className="mt-1 text-lg font-semibold">{room.haraj.status}</p>
        <p className="mt-2 text-xs text-slate-400">Phase: {room.haraj.phase ?? "-"}</p>
        {room.haraj.currentProduct ? (
          <p className="mt-2 text-xs text-slate-300">Current Product: {room.haraj.currentProduct.name}</p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {room.teams.map((team) => (
          <article key={team.teamId} className="rounded-xl border border-white/25 bg-white/12 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{team.name}</p>
            <p className="mt-1 text-4xl font-bold text-amber-300">{team.score}</p>
            <p className="mt-2 text-xs text-slate-300">Players: {team.playerCount}</p>
          </article>
        ))}
      </section>

      {room.trivia.selectedClue ? (
        <section className="rounded-xl border border-cyan-300/35 bg-cyan-500/15 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Current Question</p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-cyan-50">{room.trivia.selectedClue.prompt}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {room.trivia.selectedClue.options.map((option, index) => (
              <div
                key={`${room.trivia.selectedClue?.questionId}-${index}`}
                className="rounded-lg border border-cyan-100/30 bg-black/25 p-2 text-sm text-cyan-100"
              >
                <span className="font-semibold">{optionLabel(index)}.</span> {option}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-cyan-100/80">
            Responder: {room.trivia.currentResponderPlayerId ?? "-"} | Team: {room.trivia.currentResponderTeamId ?? "-"}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/20 bg-black/25 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Players</p>
        <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
          {room.players.length === 0 ? <p className="text-sm text-slate-400">No players joined yet.</p> : null}
          {room.players.map((player) => {
            const teamId = playerTeam.get(player.playerId)
            const team = teamId ? teamById.get(teamId) : null
            const isHighlighted = highlightPlayerId === player.playerId

            return (
              <div
                key={player.playerId}
                className={[
                  "rounded-lg border px-3 py-2 text-sm",
                  isHighlighted
                    ? "border-emerald-300 bg-emerald-950/40 text-emerald-100"
                    : "border-white/10 bg-white/5 text-slate-200",
                ].join(" ")}
              >
                <p className="font-semibold">{player.displayName}</p>
                <p className="text-xs text-slate-300">ID: {player.playerId}</p>
                <p className="text-xs text-slate-300">Team: {team?.name ?? "-"}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
