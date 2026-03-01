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

type SocialIntentKey = "greeting" | "how_are_you" | "thanks" | "goodbye" | "identity"

const KB_PUBLIC_PATH = "/chatbot/knowledge-base.md"
const SYSTEM_INSTRUCTIONS_PUBLIC_PATH = "/chatbot/system-instructions.md"
const FALLBACK_MESSAGE_PUBLIC_PATH = "/chatbot/fallback-message.md"
const SOCIAL_INTENTS_PUBLIC_PATH = "/chatbot/social-intents.md"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_FALLBACK_MESSAGE =
  "ما عندي تفاصيل كافية في قاعدة المعرفة الحالية للإجابة بدقة. تواصل مع فريق الدعم عبر واتساب على الرقم: 0576216613."
const DEFAULT_SYSTEM_INSTRUCTIONS = `
أنت مساعدة دعم عربية.
1) أجب بالعربية فقط.
2) استخدم فقط المعلومات المتاحة في مقتطفات قاعدة المعرفة.
3) إذا ما لقيت الإجابة بوضوح، أعد رسالة التحويل للدعم حرفيًا.
`.trim()
const DEFAULT_KNOWLEDGE_BASE = `
# قاعدة معرفة افتراضية
## بدء المضيف
- سجّل دخولك من /host/login باستخدام كود المضيف.
- بعد الدخول أنشئ غرفة وشارك رابط/QR مع اللاعبين.
- تأكد توزيع اللاعبين على فريقين قبل بدء اللعب.

## تريفيا
- اختر سؤال من اللوحة حسب الدور.
- يفتح البازر وبعده يتحدد مجيب واحد.
- الإجابة الصحيحة تضيف نقاط والخطأ يخصم نقاط.

## حراج
- تبدأ الجولة بصورة منتج وكل لاعب يرسل تقدير واحد.
- بعد انتهاء الوقت يتم الكشف عن السعر الحقيقي والترتيب.
- النقاط تكون حسب الأقرب للسعر الحقيقي.

## تبديل الألعاب
- تقدر تبدّل بين تريفيا وحراج من واجهة المضيف.
- التقدم والنقاط محفوظة عند التبديل.
`.trim()
const DEFAULT_SOCIAL_INTENTS: Record<SocialIntentKey, string> = {
  greeting: "يا هلا والله! 👋 نورت. وش ودك تعرف عن تشغيل جمعة العيد؟",
  how_are_you: "الحمدلله بخير دامك بخير 😄 جاهزة أساعدك في إعداد اللعبة.",
  thanks: "تسلم يا بعدي 🙏 إذا ودك أكمل معك بخطوات التشغيل أنا حاضرة.",
  goodbye: "الله معك 🌟 إذا احتجت أي شيء، ارجع لي بأي وقت.",
  identity: "أنا سارة، مساعدة جمعة العيد. أساعدك في إعداد المضيف وتشغيل الألعاب.",
}

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

const ARABIC_STOP_WORDS = new Set([
  "وش",
  "ايش",
  "اش",
  "هلا",
  "مرحبا",
  "السلام",
  "عليكم",
  "ممكن",
  "ابغى",
  "ابي",
  "بغيت",
  "هذا",
  "هذي",
  "هذه",
  "هو",
  "هي",
  "في",
  "على",
  "من",
  "الى",
  "مع",
  "عن",
  "او",
  "هل",
  "ما",
  "انا",
  "انت",
])

function normalizeArabicToken(token: string) {
  return token
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
}

function expandArabicTokenVariants(token: string) {
  const variants = new Set<string>()
  const normalized = normalizeArabicToken(token)
  variants.add(normalized)

  // Handle common doubled-lam form to improve `اللعب` vs `العب` matching.
  if (normalized.startsWith("الل") && normalized.length > 4) {
    variants.add(`ال${normalized.slice(3)}`)
  }

  // Light prefix handling for common conjunction/prefix letters.
  if (/^[وفبكل]/.test(normalized) && normalized.length > 4) {
    variants.add(normalized.slice(1))
  }

  // Light suffix handling for frequent plural/pronoun endings.
  const suffixes = ["ات", "ون", "ين", "ها", "هم", "كم", "نا"]
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 2) {
      variants.add(normalized.slice(0, -suffix.length))
    }
  }

  return Array.from(variants).filter((value) => value.length > 1 && !ARABIC_STOP_WORDS.has(value))
}

function tokenize(text: string) {
  const raw = text.match(/[\p{L}\p{N}]{2,}/gu) ?? []
  const expanded = raw.flatMap((token) => expandArabicTokenVariants(token))
  return Array.from(new Set(expanded))
}

type DomainTopic = "gameplay" | "login" | "trivia" | "haraj" | "switch" | "tv_mirroring"

function detectDomainTopic(question: string): DomainTopic | null {
  const text = normalizeArabicToken(question)
  if (/(كيف.*العب|طريقه اللعب|اللعب|ابدا اللعب|كيف ابدا)/.test(text)) {
    return "gameplay"
  }
  if (/(تسجيل|دخول|كود|login|لوقين)/.test(text)) {
    return "login"
  }
  if (/(تريفيا|بازر|سوال|نقاط|اختيارات)/.test(text)) {
    return "trivia"
  }
  if (/(حراج|سعر|تقدير|منتج)/.test(text)) {
    return "haraj"
  }
  if (/(تبديل|switch|تحويل لعبه)/.test(text)) {
    return "switch"
  }
  if (/(تلفزيون|التلفزيون|شاشه|شاشة|مرايا|mirror|airplay|cast|hdmi)/.test(text)) {
    return "tv_mirroring"
  }
  return null
}

function sectionMatchesTopic(section: { title: string; body: string }, topic: DomainTopic) {
  const text = normalizeArabicToken(`${section.title}\n${section.body}`)
  if (topic === "gameplay") {
    const hasGameplay = /(رحله المضيف|تجهيز الفعاليه|تريفيا|حراج|بدء الجلسه|تشغيل الالعاب|تسلسل الجوله|شرح لعبه|اللعب)/.test(text)
    const isSwitchFocused = /(تبديل الالعاب|تبدل بين تريفيا وحراج|حفظ التقدم)/.test(text)
    return hasGameplay && !isSwitchFocused
  }
  if (topic === "login") {
    return /(تسجيل دخول|كود المضيف|host\/login|سياسات الوصول)/.test(text)
  }
  if (topic === "trivia") {
    return /(تريفيا|بازر|المجيب|احتساب النقاط|تصنيف|سؤال)/.test(text)
  }
  if (topic === "haraj") {
    return /(حراج|تقدير|السعر الحقيقي|نظام النقاط|تعادل)/.test(text)
  }
  if (topic === "switch") {
    return /(تبديل الالعاب|تبدل بين تريفيا وحراج|حفظ التقدم)/.test(text)
  }
  if (topic === "tv_mirroring") {
    return /(اعرض شاشه المضيف على التلفزيون|ايفون|اندرويد|airplay|cast|hdmi|مشاكل شائعه في المرايا)/.test(text)
  }
  return false
}

function getTopicPriorityBoost(section: { title: string; body: string }, topic: DomainTopic) {
  const title = normalizeArabicToken(section.title)
  if (topic === "gameplay") {
    if (/(تجهيز الفعاليه|رحله المضيف|شرح لعبه التريفيا|شرح لعبه الحراج|تسلسل الجوله|احتساب النقاط|افضل ممارسات)/.test(title)) {
      return 8
    }
    if (/(حالات الغرفه|حدود هذه القاعده|معلومات الخصوصيه)/.test(title)) {
      return -3
    }
  }
  if (topic === "tv_mirroring") {
    if (/(كيف اعرض شاشه المضيف على التلفزيون|ايفون|اندرويد|لابتوب)/.test(title)) {
      return 10
    }
    if (/(مشاكل شائعه في المرايا)/.test(title)) {
      return 3
    }
    if (/(تجهيز الجلسه قبل اللعب|حالات الغرفه)/.test(title)) {
      return -2
    }
  }
  return 0
}

function parseSocialIntentsMarkdown(markdown: string): Record<SocialIntentKey, string> {
  const output: Record<SocialIntentKey, string> = { ...DEFAULT_SOCIAL_INTENTS }
  const allowedKeys = new Set<SocialIntentKey>(["greeting", "how_are_you", "thanks", "goodbye", "identity"])
  const sections = splitKnowledgeBaseSections(markdown)

  for (const section of sections) {
    const key = normalizeArabicToken(section.title).replace(/\s+/g, "_") as SocialIntentKey
    if (!allowedKeys.has(key)) {
      continue
    }
    const value = section.body.trim()
    if (value.length > 0) {
      output[key] = value
    }
  }

  return output
}

function detectSocialIntent(message: string): SocialIntentKey | null {
  const normalizedMessage = normalizeArabicToken(message)

  const patterns: Array<{ key: SocialIntentKey; regex: RegExp }> = [
    { key: "greeting", regex: /(هلا|مرحبا|السلام عليكم|ياهلا|حي[ا|ي]ك|hi|hello)/i },
    { key: "how_are_you", regex: /(كيف حالك|كيفك|شلونك|اخبارك|how are you)/i },
    { key: "thanks", regex: /(شكرا|مشكور|يعطيك العافيه|يسلمو|thanks|thank you)/i },
    { key: "goodbye", regex: /(مع السلامه|اشوفك|باي|bye|goodbye)/i },
    { key: "identity", regex: /(مين انتي|من انتي|اسمك|منتي|who are you|your name)/i },
  ]

  for (const pattern of patterns) {
    if (pattern.regex.test(normalizedMessage)) {
      return pattern.key
    }
  }

  return null
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
  const topic = detectDomainTopic(question)

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
      if (topic && sectionMatchesTopic(section, topic)) {
        score += 4
        score += getTopicPriorityBoost(section, topic)
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

function isClarificationPrompt(message: string) {
  const normalized = normalizeArabicToken(message)
  return /(كيف يعني|وش يعني|يعني ايش|وضح|وضح اكثر|ممكن توضح|اشرح اكثر|ما فهمت|still|what do you mean)/i.test(
    normalized
  )
}

function buildRetrievalQuery(message: string, customerHistory: string[]) {
  if (!isClarificationPrompt(message)) {
    return message
  }

  const normalizedCurrent = normalizeArabicToken(message)
  const previous = [...customerHistory]
    .reverse()
    .find((item) => normalizeArabicToken(item) !== normalizedCurrent)

  if (!previous) {
    return message
  }

  return `${previous}\n${message}`
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

function buildKnowledgeFallbackReply(matchedSections: KnowledgeSection[], fallbackMessage: string) {
  const primary = matchedSections[0]
  if (!primary) {
    return fallbackMessage
  }

  const lines = primary.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .filter((line) => line.length > 0)
    .slice(0, 3)

  const summarizedLines =
    lines.length > 0
      ? lines.map((line) => `- ${line}`).join("\n")
      : `- ${primary.body.slice(0, 180)}`

  const heading = primary.title ? `في قسم "${primary.title}"` : "في قاعدة المعرفة"

  return `يا هلا! حسب المعلومات ${heading}:\n${summarizedLines}\n\nإذا تبغى شرح أدق، قلّي النقطة اللي ودك أركز عليها.`
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
  let socialIntents: Record<SocialIntentKey, string> = { ...DEFAULT_SOCIAL_INTENTS }

  try {
    const loaded = await Promise.all([
      readPublicContentFile(request, KB_PUBLIC_PATH),
      readPublicContentFile(request, SYSTEM_INSTRUCTIONS_PUBLIC_PATH),
      readPublicContentFile(request, FALLBACK_MESSAGE_PUBLIC_PATH),
      readPublicContentFile(request, SOCIAL_INTENTS_PUBLIC_PATH),
    ])
    knowledgeBase = loaded[0] || DEFAULT_KNOWLEDGE_BASE
    systemInstructions = loaded[1] || DEFAULT_SYSTEM_INSTRUCTIONS
    fallbackMessage = loaded[2] || DEFAULT_FALLBACK_MESSAGE
    socialIntents = parseSocialIntentsMarkdown(loaded[3] || "")
  } catch {
    // Graceful degradation: keep default content instead of hard-failing with 500.
  }

  if (!knowledgeBase || !systemInstructions || !fallbackMessage) {
    knowledgeBase = DEFAULT_KNOWLEDGE_BASE
    systemInstructions = DEFAULT_SYSTEM_INSTRUCTIONS
    fallbackMessage = DEFAULT_FALLBACK_MESSAGE
    socialIntents = { ...DEFAULT_SOCIAL_INTENTS }
  }

  const socialIntent = detectSocialIntent(message)
  if (socialIntent) {
    return jsonResponse(200, {
      reply: socialIntents[socialIntent],
      source: "intent",
    })
  }

  const customerHistory = parseCustomerHistory(rawBody.customerHistory)
  const retrievalQuery = buildRetrievalQuery(message, customerHistory)
  const matchedSections = rankKnowledgeSections(knowledgeBase, retrievalQuery, 4)

  if (matchedSections.length === 0) {
    return jsonResponse(200, {
      reply: fallbackMessage,
      source: "fallback",
    })
  }

  const knowledgeFallbackReply = buildKnowledgeFallbackReply(matchedSections, fallbackMessage)

  const apiKey = process.env.HROOF_GEMINI_API_KEY
  if (!apiKey) {
    return jsonResponse(200, {
      reply: knowledgeFallbackReply,
      source: "kb_fallback",
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
        reply: knowledgeFallbackReply,
        source: "kb_fallback",
      })
    }

    return jsonResponse(200, {
      reply,
      source: "kb",
    })
  } catch {
    return jsonResponse(200, {
      reply: knowledgeFallbackReply,
      source: "kb_fallback",
    })
  }
}
