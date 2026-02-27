#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-}}"
if [[ -z "$BASE_URL" ]]; then
  echo "Usage: BASE_URL=https://<deployment> scripts/smoke-live.sh"
  echo "   or: scripts/smoke-live.sh https://<deployment>"
  exit 1
fi

HOST_USER="${HOST_USER:-host-demo}"
HOST_PASS="${HOST_PASS:-demo1234}"

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

STATUS=""
BODY=""

api_call() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local out_file="$TMP_DIR/response.json"

  local args=(
    -sS
    -o "$out_file"
    -w "%{http_code}"
    -X "$method"
    "$BASE_URL$path"
    -H "content-type: application/json"
  )

  if [[ -n "$token" ]]; then
    args+=( -H "authorization: Bearer $token" )
  fi

  if [[ -n "$body" ]]; then
    args+=( -d "$body" )
  fi

  STATUS="$(curl "${args[@]}")"
  BODY="$(cat "$out_file")"
}

expect_status() {
  local expected="$1"
  local label="$2"
  if [[ "$STATUS" != "$expected" ]]; then
    echo "[FAIL] $label -> expected $expected got $STATUS"
    echo "$BODY" | jq -C . || echo "$BODY"
    exit 1
  fi

  echo "[OK] $label -> $STATUS"
}

request_id() {
  echo "$(date +%s)-$RANDOM-$RANDOM"
}

host_action() {
  local token="$1"
  local room_id="$2"
  local type="$3"
  local payload="{}"
  if [[ $# -ge 4 ]]; then
    payload="$4"
  fi
  local request_body
  request_body="$(jq -cn --arg type "$type" --arg rid "$(request_id)" --argjson payload "$payload" '{v:"v1", type:$type, requestId:$rid, payload:$payload}')"
  api_call POST "/api/rooms/$room_id/actions" "$token" "$request_body"
  expect_status 200 "$type"
}

player_action() {
  local token="$1"
  local room_id="$2"
  local type="$3"
  local payload="{}"
  if [[ $# -ge 4 ]]; then
    payload="$4"
  fi
  local request_body
  request_body="$(jq -cn --arg type "$type" --arg rid "$(request_id)" --argjson payload "$payload" '{v:"v1", type:$type, requestId:$rid, payload:$payload}')"
  api_call POST "/api/rooms/$room_id/actions" "$token" "$request_body"
  expect_status 200 "$type"
}

echo "BASE_URL=$BASE_URL"
echo "HOST_USER=$HOST_USER"

printf "\n== Host login ==\n"
api_call POST /api/auth/host/login "" "{\"username\":\"$HOST_USER\",\"password\":\"$HOST_PASS\"}"
expect_status 200 "host.login"
HOST_TOKEN="$(echo "$BODY" | jq -er '.token')"

printf "\n== Create room ==\n"
api_call POST /api/rooms/create "$HOST_TOKEN"
if [[ "$STATUS" == "409" ]] && [[ "$(echo "$BODY" | jq -r '.error.code // ""')" == "HOST_ALREADY_ACTIVE" ]]; then
  ACTIVE_ROOM_ID="$(echo "$BODY" | jq -r '.error.details.activeRoomId // ""')"
  if [[ -n "$ACTIVE_ROOM_ID" ]]; then
    echo "Found active room $ACTIVE_ROOM_ID. Ending it before retry."
    api_call POST "/api/rooms/$ACTIVE_ROOM_ID/end" "$HOST_TOKEN"
    expect_status 200 "rooms.end_active"
    api_call POST /api/rooms/create "$HOST_TOKEN"
  fi
fi
expect_status 201 "rooms.create"
ROOM_ID="$(echo "$BODY" | jq -er '.room.roomId')"

echo "Room ID: $ROOM_ID"

printf "\n== Join players ==\n"
api_call POST "/api/rooms/$ROOM_ID/join" "" '{"name":"Smoke Player 1"}'
expect_status 201 "join.player1"
P1_TOKEN="$(echo "$BODY" | jq -er '.playerToken')"
P1_ID="$(echo "$BODY" | jq -er '.player.id')"

api_call POST "/api/rooms/$ROOM_ID/join" "" '{"name":"Smoke Player 2"}'
expect_status 201 "join.player2"
P2_TOKEN="$(echo "$BODY" | jq -er '.playerToken')"
P2_ID="$(echo "$BODY" | jq -er '.player.id')"

printf "\n== Host flow ==\n"
host_action "$HOST_TOKEN" "$ROOM_ID" "host.lockLobby"
host_action "$HOST_TOKEN" "$ROOM_ID" "host.startTeams"
host_action "$HOST_TOKEN" "$ROOM_ID" "host.startTrivia"

printf "\n== Select first clue ==\n"
api_call GET "/api/rooms/$ROOM_ID/state" "$HOST_TOKEN"
expect_status 200 "rooms.state"
CLUE_ID="$(echo "$BODY" | jq -er '.payload.room.trivia.board[0].clues[0].questionId')"
host_action "$HOST_TOKEN" "$ROOM_ID" "host.selectTriviaClue" "{\"questionId\":\"$CLUE_ID\"}"

printf "\n== Buzz and submit answer ==\n"
sleep 6
player_action "$P1_TOKEN" "$ROOM_ID" "player.input" '{"intent":"buzz"}'

api_call GET "/api/rooms/$ROOM_ID/state" "$HOST_TOKEN"
expect_status 200 "rooms.state.after_buzz"
RESPONDER_ID="$(echo "$BODY" | jq -er '.payload.room.trivia.currentResponderPlayerId')"
if [[ "$RESPONDER_ID" == "$P1_ID" ]]; then
  RESPONDER_TOKEN="$P1_TOKEN"
elif [[ "$RESPONDER_ID" == "$P2_ID" ]]; then
  RESPONDER_TOKEN="$P2_TOKEN"
else
  echo "[FAIL] responder id $RESPONDER_ID does not match known players"
  exit 1
fi

player_action "$RESPONDER_TOKEN" "$ROOM_ID" "player.submitAnswer" '{"option":"A"}'
host_action "$HOST_TOKEN" "$ROOM_ID" "host.nextQuestion"

printf "\n== Reconnect active player ==\n"
api_call POST "/api/rooms/$ROOM_ID/reconnect" "$RESPONDER_TOKEN"
expect_status 200 "player.reconnect"

printf "\n== End session ==\n"
host_action "$HOST_TOKEN" "$ROOM_ID" "host.endSession"

printf "\n== Validate room closed for join ==\n"
api_call POST "/api/rooms/$ROOM_ID/join" "" '{"name":"Late Joiner"}'
expect_status 409 "join.after_end"

JOIN_ERROR_CODE="$(echo "$BODY" | jq -r '.error.code // ""')"
if [[ "$JOIN_ERROR_CODE" != "ROOM_NOT_JOINABLE" ]]; then
  echo "[FAIL] Expected ROOM_NOT_JOINABLE after end, got: $JOIN_ERROR_CODE"
  exit 1
fi

printf "\nSmoke test completed successfully for room %s\n" "$ROOM_ID"
