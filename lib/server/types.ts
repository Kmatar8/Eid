export type RoomState =
  | "lobby_open"
  | "lobby_locked"
  | "teams_ready"
  | "game_live"
  | "between_games"
  | "paused_wait_host"
  | "session_completed"
  | "expired"
  | "superseded"

export type AvatarType = "none" | "emoji" | "image"

export type HostRecord = {
  id: string
  username: string
  passwordHash: string
  activeRoomId: string | null
  createdAt: number
}

export type RoomRecord = {
  id: string
  hostId: string
  state: RoomState
  version: number
  createdAt: number
  updatedAt: number
  expiresAt: number
  pausedAt: number | null
  completedAt: number | null
  supersededBy: string | null
}

export type PlayerRecord = {
  id: string
  roomId: string
  displayName: string
  avatarType: AvatarType
  avatarValue: string | null
  joinedAt: number
  lastSeenAt: number
}

export type RoomEventRecord = {
  id: string
  seq: number
  roomId: string
  roomVersion: number
  eventType: string
  payload: Record<string, unknown>
  createdAt: number
}

export type TeamRecord = {
  id: string
  roomId: string
  name: string
  order: number
  score: number
  createdAt: number
}

export type TriviaOption = "A" | "B" | "C" | "D"

export type TriviaPhase =
  | "question_prepare"
  | "question_active_primary_team"
  | "question_active_steal_team"
  | "answer_reveal"
  | "score_commit"
  | "next_question_or_end"

export type TriviaQuestion = {
  id: string
  prompt: string
  options: [string, string, string, string]
  correctOption: TriviaOption
}

export type TriviaSnapshot = {
  status: "idle" | "in_progress" | "completed"
  phase: TriviaPhase | null
  questionIndex: number
  totalQuestions: number
  currentTeamId: string | null
  currentResponderPlayerId: string | null
  currentQuestion: {
    id: string
    prompt: string
    options: [string, string, string, string]
  } | null
  lastResult: {
    correctOption: TriviaOption
    answeredOption: TriviaOption
    wasCorrect: boolean
    awardedTeamId: string | null
    awardedPoints: number
  } | null
}

export type RoomSnapshot = {
  roomId: string
  hostId: string
  state: RoomState
  version: number
  createdAt: number
  updatedAt: number
  expiresAt: number
  playerCount: number
  players: Array<{
    playerId: string
    displayName: string
    avatarType: AvatarType
    avatarValue: string | null
    lastSeenAt: number
  }>
  teams: Array<{
    teamId: string
    name: string
    order: number
    score: number
    playerCount: number
  }>
  teamAssignments: Array<{
    playerId: string
    teamId: string
  }>
  trivia: TriviaSnapshot
}
