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
  email: string | null
  passwordHash: string
  accessExpiresAt: number | null
  activeRoomId: string | null
  createdAt: number
}

export type RedeemCodeStatus = "active" | "redeemed" | "expired"

export type RedeemCodeRecord = {
  id: string
  codeHash: string
  email: string | null
  status: RedeemCodeStatus
  createdAt: number
  expiresAt: number | null
  redeemedAt: number | null
  redeemedByHostId: string | null
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
  | "board_turn"
  | "countdown"
  | "buzzer_open"
  | "answer_active"
  | "answer_reveal"
  | "next_question_or_end"

export type TriviaQuestion = {
  id: string
  categoryId: string
  categoryName: string
  points: number
  prompt: string
  options: [string, string, string, string]
  correctOption: TriviaOption
}

export type TriviaBoardClueSnapshot = {
  questionId: string
  points: number
  used: boolean
}

export type TriviaBoardCategorySnapshot = {
  categoryId: string
  name: string
  clues: TriviaBoardClueSnapshot[]
}

export type TriviaSnapshot = {
  status: "idle" | "in_progress" | "completed"
  phase: TriviaPhase | null
  questionIndex: number
  totalQuestions: number
  remainingQuestions: number
  currentTeamId: string | null
  currentPickerPlayerId: string | null
  currentResponderPlayerId: string | null
  currentResponderTeamId: string | null
  countdownEndsAt: number | null
  buzzEndsAt: number | null
  answerEndsAt: number | null
  board: TriviaBoardCategorySnapshot[]
  selectedClue: {
    questionId: string
    categoryId: string
    categoryName: string
    points: number
    prompt: string
    options: [string, string, string, string]
  } | null
  lastResult: {
    questionId: string
    correctOption: TriviaOption
    answeredOption: TriviaOption | null
    wasCorrect: boolean
    awardedTeamId: string | null
    awardedPoints: number
    reason: "correct" | "wrong" | "timeout" | "no_buzz" | "host_skip"
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
