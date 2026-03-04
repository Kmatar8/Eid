# Milestone Board

This board tracks implementation order, ownership, and execution status.

## Global Status Keys
- `planned`
- `in_progress`
- `blocked`
- `done`

## Priority Sequence
1. `T-0001` Foundation
2. `T-0002` Realtime Core
3. `T-0003` Teaming + Scoreboard
4. `T-0004` Trivia v1
5. `T-0005` Reliability + Scale Hardening

## Board
| Order | Task ID | Milestone | Title | Status | Owner | Blocked By | Notes |
|---|---|---|---|---|---|---|---|
| 1 | T-0001 | M1 | Foundation - Host Auth, Room Lifecycle, QR Join, Reconnect | done | AI-Agent | - | First executable slice completed |
| 2 | T-0002 | M2 | Realtime Core - Room WebSocket Protocol and State Sync | done | AI-Agent | T-0001 | Protocol core delivered (HTTP diff transport) |
| 3 | T-0003 | M3 | Teaming + Team Scoreboard Persistence | done | AI-Agent | T-0001, T-0002 | Team model and score persistence implemented |
| 4 | T-0004 | M4 | Trivia v1 Gameplay Engine (Primary + Steal) | done | AI-Agent | T-0001, T-0002, T-0003 | Trivia v1 gameplay flow implemented |
| 5 | T-0005 | M5 | Reliability + Scale Hardening (Timeouts, Cost, Observability, Load) | in_progress | AI-Agent | T-0001, T-0002, T-0003, T-0004 | Idempotency added; load/metrics pending |
| 6 | T-0006 | M4 | Live E2E Testing Surface (Host/Join/Controller/Room) | done | AI-Agent | T-0001, T-0002, T-0003, T-0004 | Host/join/controller/room test surfaces + smoke script delivered |
| 7 | T-0007 | M4 | Controller UX Simplification + Submit Reliability | done | AI-Agent | T-0006 | Controller simplified; submit reliability hardening deployed |
| 8 | T-0008 | M4 | Production Host Journey UI (Landing -> Login -> Lobby -> Game -> Celebration) | in_progress | AI-Agent | T-0006, T-0007 | User-approved staged host flow and TV-first UX |
| 9 | T-0026 | M5 | Room-Scoped DO Autoscaling + Low-Latency Realtime | in_progress | AI-Agent | T-0005 | Phase 2 advanced: DO delta publish, host idempotency/rate limiting, 100-room harness, Jeopardy action guards, faster stream hydration/polling, controller desync mitigation |
| 10 | T-0034 | M1 | Landing AI KB Chatbot (Arabic, Gemini) | done | AI-Agent | T-0008 | Landing widget + server API + KB/prompt folder |
| 11 | T-0039 | M1 | Landing Chatbot Copy Refresh | done | AI-Agent | T-0034 | Requested title/greeting/subtitle text updates |
| 12 | T-0040 | M1 | Chatbot Host Knowledge Base + Saudi Tone Instructions | done | AI-Agent | T-0034 | Host workflow KB enrichment and tone rules update |
| 13 | T-0041 | M1 | Chatbot Content Origin Resolution Fix | done | AI-Agent | T-0034 | Fix `CHATBOT_CONFIG_ERROR` from origin mismatch on markdown loading |
| 14 | T-0042 | M1 | Chatbot Graceful Config Fallback | done | AI-Agent | T-0034 | Prevent chatbot 500 by degrading config/key failures to safe fallback replies |
| 15 | T-0043 | M1 | Chatbot KB Answer Fallback Reliability | done | AI-Agent | T-0034 | Return KB-derived answers when Gemini/config path fails |
| 16 | T-0044 | M1 | Chatbot Social Intents + Arabic Retrieval Hardening | done | AI-Agent | T-0034 | Add social intent responses and improve Arabic matching reliability |
| 17 | T-0045 | M1 | Chatbot Brand Name + Host Onboarding KB Expansion | done | AI-Agent | T-0034 | Rename to `جمعة العيد`, expand onboarding KB, and improve follow-up context handling |
| 18 | T-0046 | M1 | Chatbot WhatsApp Escalation Number Finalization | done | AI-Agent | T-0034 | Finalize fallback escalation number to `0576216613` |
| 19 | T-0047 | M4 | Haraj Reveal UX + Arabic/English Estimate Normalization | done | AI-Agent | T-0033 | Host reveal layout/countdown/confetti updates + controller/server input normalization |
| 20 | T-0048 | M4 | Haraj Products from CSV + Image Path Standardization | done | AI-Agent | T-0033 | Generate product bank from `haraj.csv` and standardize image folder path |
| 21 | T-0049 | M4 | Haraj Image Asset Resolution + Mixed Size Display Hardening | done | AI-Agent | T-0048 | Resolve `.jpg/.jpeg` mismatches and improve host image fit for mixed dimensions |
| 22 | T-0050 | M4 | Haraj Image WebP Optimization Pipeline | done | AI-Agent | T-0049 | Add batch WebP conversion and make generated catalog prefer WebP assets |
| 23 | T-0051 | M4 | Join Page Validation Overlay + Player UI Cleanup | done | AI-Agent | T-0006 | Overlay guidance for missing name/avatar and remove room-id/host hints from join page |
| 24 | T-0052 | M4 | Host Overview Actions + Haraj Reveal Polish | done | AI-Agent | T-0047 | Remove overview end buttons, widen next-round CTA, add reveal confetti + winner row colors |
| 25 | T-0054 | M4 | Host Post-Jeopardy Routing to Haraj Overview | done | AI-Agent | T-0052 | Route post-Jeopardy `between_games` to Haraj overview; final results only after all games |
| 26 | T-0055 | M5 | Cloudflare Deploy Retry Hardening | done | AI-Agent | T-0054 | Add deploy retry wrapper for transient API 502 failures and update CI command guidance |
| 27 | T-0057 | M1 | Landing Social Row Layout Adjustment | done | AI-Agent | T-0055 | Render TikTok profile chip beside festive pill in responsive row |
| 28 | T-0058 | M4 | Host Mobile TV-Mirror Guidance + Compact Mode | done | AI-Agent | T-0057 | Added mobile helper modal, portrait guidance alert, and persisted compact mirror scaling mode on `/host` |
| 29 | T-0059 | M1 | Host Surfaces Laptop-Only Access Gate | done | AI-Agent | T-0058 | Enforced non-dismissible laptop-only overlay on `/host/login` and host/room runtime wrappers |

## Execution Rules
1. Only one `in_progress` task per milestone unless explicitly approved.
2. A task can move to `done` only when its DoD in `AGENTS.md` is satisfied.
3. If a task is blocked, add blocker details and a decision owner in `Notes`.
4. Update this board whenever a task status changes.

## Current Focus
- In progress: `T-0005`, `T-0008`, `T-0026`
- Next recommended start after completion: staged load test + reliability report
