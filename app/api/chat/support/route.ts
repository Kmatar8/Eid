import { errorResponse, jsonResponse, safeJson } from "@/lib/server/http"

export const runtime = "nodejs"

type ChatRequestBody = {
  message?: unknown
  customerHistory?: unknown
}

type KnowledgeSection = {
  title: string
  body: string
  score: number
}

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>
  }
}

type GeminiResponse = {
  candidates?: GeminiCandidate[]
}

const KB_PUBLIC_PATH = "/chatbot/knowledge-base.md"
const SYSTEM_INSTRUCTIONS_PUBLIC_PATH = "/chatbot/system-instructions.md"
const FALLBACK_MESSAGE_PUBLIC_PATH = "/chatbot/fallback-message.md"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_FALLBACK_MESSAGE =
  "ما عندي تفاصيل كافية في قاعدة المعرفة الحالية للإجابة بدقة. تواصل مع فريق الدعم عبر واتساب على الرقم: [سيتم تزويده لاحقًا]."
const DEFAULT_SYSTEM_INSTRUCTIONS = `
أنت مساعدة دعم عربية.
1) أجب بالعربية فقط.
2) استخدم فقط المعلومات المتاحة في مقتطفات قاعدة المعرفة.
3) إذا ما لقيت الإجابة بوضوح، أعد رسالة التحويل للدعم حرفيًا.
`.trim()
const DEFAULT_KNOWLEDGE_BASE = `
# قاعدة معرفة افتراضية
## بدء المضيف
- المضيف يسجل الدخول من /host/login باستخدام كود المضيف.
- بعد الدخول ينشئ غرفة ويشارك رابط/QR.

## التشغيل
- وزّع اللاعبين على فريقين قبل البدء.
- ابدأ اللعبة من واجهة المضيف.
- تقدر تبدّل بين الألعاب حسب حالة الجلسة.
`.trim()

const MAX_MESSAGE_LENGTH = 800
const MAX_CUSTOMER_HISTORY_ITEMS = 20
const MAX_CUSTOMER_HISTORY_ITEM_LENGTH = 800

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const RATE_LIMIT_ENTRY_TTL_MS = 5 * 60_000
const RATE_LIMIT_SWEEP_INTERVAL = 200

type GlobalWithChatRateLimit = typeof globalThis & {
  __hroofChatRateLimitByIp?: Map<string, number[]>
  __hroofChatRateLimitCalls?: number
}

function getRateLimitStore() {
  const globalWithRateLimit = globalThis as GlobalWithChatRateLimit
  if (!globalWithRateLimit.__hroofChatRateLimitByIp) {
    globalWithRateLimit.__hroofChatRateLimitByIp = new Map<string, number[]>()
  }
  return globalWithRateLimit.__hroofChatRateLimitByIp
}

function maybeSweepRateLimitStore(now: number, store: Map<string, number[]>) {
  const globalWithRateLimit = globalThis as GlobalWithChatRateLimit
  const calls = (globalWithRateLimit.__hroofChatRateLimitCalls ?? 0) + 1
  globalWithRateLimit.__hroofChatRateLimitCalls = calls

  if (calls % RATE_LIMIT_SWEEP_INTERVAL !== 0) {
    return
  }

  const staleCutoff = now - RATE_LIMIT_ENTRY_TTL_MS
  for (const [ip, timestamps] of store.entries()) {
    const latest = timestamps[timestamps.length - 1] ?? 0
    if (latest < staleCutoff) {
      store.delete(ip)
    }
  }
}

function consumeChatQuota(ip: string) {
  const store = getRateLimitStore()
  const now = Date.now()
  maybeSweepRateLimitStore(now, store)

  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const timestamps = store.get(ip) ?? []
  const active = timestamps.filter((value) => value > cutoff)

  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    store.set(ip, active)
    return false
  }

  active.push(now)
  store.set(ip, active)
  return true
}

function getClientIp(request: Request) {
  const forward = request.headers.get("x-forwarded-for")
  if (forward) {
    const first = forward.split(",")[0]?.trim()
    if (first) {
      return first
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

function normalizeInputString(raw: unknown) {
  if (typeof raw !== "string") {
    return null
  }
  const value = raw.trim().replace(/\s+/g, " ")
  return value.length > 0 ? value : null
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []
}

function splitKnowledgeBaseSections(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const sections: Array<{ title: string; body: string }> = []

  let currentTitle = "مقدمة"
  let currentBody: string[] = []

  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line)) {
      if (currentBody.join("").trim().length > 0) {
        sections.push({
          title: currentTitle,
          body: currentBody.join("\n").trim(),
        })
      }
      currentTitle = line.replace(/^#{1,4}\s+/, "").trim()
      currentBody = []
      continue
    }
    currentBody.push(line)
  }

  if (currentBody.join("").trim().length > 0) {
    sections.push({
      title: currentTitle,
      body: currentBody.join("\n").trim(),
    })
  }

  return sections
}

function rankKnowledgeSections(markdown: string, question: string, limit: number) {
  const sections = splitKnowledgeBaseSections(markdown)
  const questionTokens = new Set(tokenize(question))

  if (questionTokens.size === 0) {
    return [] as KnowledgeSection[]
  }

  const ranked = sections
    .map((section) => {
      const sectionTokens = tokenize(`${section.title}\n${section.body}`)
      let score = 0
      for (const token of sectionTokens) {
        if (questionTokens.has(token)) {
          score += 1
        }
      }
      return {
        ...section,
        score,
      } satisfies KnowledgeSection
    })
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked.slice(0, Math.max(1, limit))
}

async function readPublicContentFile(request: Request, publicPath: string) {
  const overrideBaseUrl = normalizeInputString(process.env.HROOF_PUBLIC_BASE_URL)
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim() || "https"
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim()
  const host = request.headers.get("host")?.trim()
  const requestOrigin = new URL(request.url).origin

  const candidateOrigins = [
    overrideBaseUrl,
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : null,
    host ? `${forwardedProto}://${host}` : null,
    requestOrigin,
  ].filter((value): value is string => Boolean(value))

  const uniqueOrigins = Array.from(new Set(candidateOrigins))

  let lastError: unknown = null
  for (const origin of uniqueOrigins) {
    try {
      const url = new URL(publicPath, origin)
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "text/plain, text/markdown",
        },
      })

      if (!response.ok) {
        lastError = new Error(`Failed to load public content from ${url.toString()} with status ${response.status}`)
        continue
      }

      return (await response.text()).trim()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error(`Failed to load public content: ${publicPath}`)
}

function parseCustomerHistory(rawHistory: unknown) {
  if (!Array.isArray(rawHistory)) {
    return [] as string[]
  }

  const cleaned = rawHistory
    .map((item) => normalizeInputString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.slice(0, MAX_CUSTOMER_HISTORY_ITEM_LENGTH))

  return cleaned.slice(-MAX_CUSTOMER_HISTORY_ITEMS)
}

function buildGeminiUserPrompt(input: {
  message: string
  customerHistory: string[]
  matchedSections: KnowledgeSection[]
  fallbackMessage: string
}) {
  const historyBlock =
    input.customerHistory.length === 0
      ? "- لا يوجد"
      : input.customerHistory.map((item, index) => `${index + 1}) ${item}`).join("\n")

  const sectionsBlock = input.matchedSections
    .map(
      (section, index) =>
        `[مقطع ${index + 1}] ${section.title}\n${section.body}`
    )
    .join("\n\n")

  return `
رسالة التحويل للدعم:
${input.fallbackMessage}

آخر رسائل العميل (حتى 20 رسالة):
${historyBlock}

سؤال العميل الحالي:
${input.message}

مقتطفات قاعدة المعرفة المتاحة للإجابة:
${sectionsBlock}

أجب الآن وفق التعليمات.
`.trim()
}

function extractGeminiText(data: GeminiResponse) {
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts || parts.length === 0) {
    return null
  }
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim()
  return text.length > 0 ? text : null
}

function hasArabicCharacters(text: string) {
  return /[\u0600-\u06FF]/.test(text)
}

async function generateGeminiReply(input: {
  apiKey: string
  model: string
  systemInstructions: string
  userPrompt: string
}) {
  const endpoint = `${DEFAULT_GEMINI_BASE_URL}/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemInstructions }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: input.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        maxOutputTokens: 400,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}`)
  }

  const data = (await response.json()) as GeminiResponse
  return extractGeminiText(data)
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!consumeChatQuota(ip)) {
    return errorResponse(429, "RATE_LIMITED", "عدد الطلبات كبير. حاول مرة أخرى بعد دقيقة.")
  }

  const rawBody = await safeJson<ChatRequestBody>(request)
  if (!rawBody) {
    return errorResponse(400, "INVALID_BODY", "تعذر قراءة الطلب.")
  }

  const message = normalizeInputString(rawBody.message)
  if (!message) {
    return errorResponse(400, "INVALID_MESSAGE", "الرسالة مطلوبة.")
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(400, "MESSAGE_TOO_LONG", "الرسالة طويلة جدًا.")
  }

  let knowledgeBase = DEFAULT_KNOWLEDGE_BASE
  let systemInstructions = DEFAULT_SYSTEM_INSTRUCTIONS
  let fallbackMessage = DEFAULT_FALLBACK_MESSAGE

  try {
    const loaded = await Promise.all([
      readPublicContentFile(request, KB_PUBLIC_PATH),
      readPublicContentFile(request, SYSTEM_INSTRUCTIONS_PUBLIC_PATH),
      readPublicContentFile(request, FALLBACK_MESSAGE_PUBLIC_PATH),
    ])
    knowledgeBase = loaded[0] || DEFAULT_KNOWLEDGE_BASE
    systemInstructions = loaded[1] || DEFAULT_SYSTEM_INSTRUCTIONS
    fallbackMessage = loaded[2] || DEFAULT_FALLBACK_MESSAGE
  } catch {
    // Graceful degradation: keep default content instead of hard-failing with 500.
  }

  if (!knowledgeBase || !systemInstructions || !fallbackMessage) {
    knowledgeBase = DEFAULT_KNOWLEDGE_BASE
    systemInstructions = DEFAULT_SYSTEM_INSTRUCTIONS
    fallbackMessage = DEFAULT_FALLBACK_MESSAGE
  }

  const customerHistory = parseCustomerHistory(rawBody.customerHistory)
  const matchedSections = rankKnowledgeSections(knowledgeBase, message, 4)

  if (matchedSections.length === 0) {
    return jsonResponse(200, {
      reply: fallbackMessage,
      source: "fallback",
    })
  }

  const apiKey = process.env.HROOF_GEMINI_API_KEY
  if (!apiKey) {
    return jsonResponse(200, {
      reply: fallbackMessage,
      source: "fallback",
    })
  }

  const model = process.env.HROOF_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const userPrompt = buildGeminiUserPrompt({
    message,
    customerHistory,
    matchedSections,
    fallbackMessage,
  })

  try {
    const reply = await generateGeminiReply({
      apiKey,
      model,
      systemInstructions,
      userPrompt,
    })

    if (!reply || !hasArabicCharacters(reply)) {
      return jsonResponse(200, {
        reply: fallbackMessage,
        source: "fallback",
      })
    }

    return jsonResponse(200, {
      reply,
      source: "kb",
    })
  } catch {
    return jsonResponse(200, {
      reply: fallbackMessage,
      source: "fallback",
    })
  }
}
