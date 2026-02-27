"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  Brain,
  Maximize2,
  Monitor,
  MoonStar,
  Paintbrush2,
  Share2,
  Sparkles,
  Timer,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react"

import { FireworksBackground } from "@/components/ui/fireworks"
import FireworksBackgroundDemo from "@/components/fireworks-demo"
import { ThemeToggle } from "@/components/theme-toggle"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type EidGame = {
  id: string
  title: string
  tagline: string
  description: string
  players: string
  duration: string
  energy: string
  icon: LucideIcon
  gradient: string
  glow: string
  image?: string
}

const games: EidGame[] = [
  {
    id: "charades",
    title: "تمثيل بلا كلام",
    tagline: "تحدي التمثيل والضحك",
    description:
      "مثل الأمثال، المسلسلات، وشخصيات العيد بينما يحاول الجميع التخمين قبل انتهاء الوقت.",
    players: "4-14",
    duration: "8-12 دقيقة",
    energy: "عالي",
    icon: Users,
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)",
    glow: "rgba(251, 191, 36, 0.55)",
    image: "/images/tas.jpg",
  },
  {
    id: "family-trivia",
    title: "مسابقات العائلة",
    tagline: "قصص، ذكريات، ومفاجآت",
    description:
      "اختبر معلوماتكم عن قصص العائلة، التقاليد، ومواقف العيد المضحكة.",
    players: "3-20",
    duration: "10-15 دقيقة",
    energy: "متوسط",
    icon: Brain,
    gradient: "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
    glow: "rgba(20, 184, 166, 0.52)",
    image: "/images/zizo.jpg",
  },
  {
    id: "speed-draw",
    title: "رسم سريع",
    tagline: "ارسم قبل أن يرن الجرس",
    description:
      "لاعب واحد يرسم المطلوب على الشاشة بينما تصرخ العائلة بالتوقعات في الوقت الفعلي.",
    players: "2-12",
    duration: "6-10 دقيقة",
    energy: "عالي",
    icon: Paintbrush2,
    gradient: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    glow: "rgba(236, 72, 153, 0.45)",
  },
  {
    id: "quick-buzz",
    title: "سرعة بديهة",
    tagline: "أسئلة سريعة وردود أسرع",
    description:
      "جولات سريعة، نقاط فورية، ومنافسة شرسة للأسرع في الإجابة.",
    players: "2-10",
    duration: "5-8 دقيقة",
    energy: "ناري",
    icon: Zap,
    gradient: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)",
    glow: "rgba(132, 204, 22, 0.5)",
  },
  {
    id: "voice-impressions",
    title: "قلد الأصوات",
    tagline: "لهجات مضحكة وجمل شهيرة",
    description:
      "قلد أصوات، عبارات شهيرة، أو شخصيات من العائلة وخلي الكل يحاول يعرف مين.",
    players: "4-16",
    duration: "8-12 دقيقة",
    energy: "مرح",
    icon: Volume2,
    gradient: "linear-gradient(135deg, #f43f5e 0%, #f97316 100%)",
    glow: "rgba(244, 63, 94, 0.5)",
  },
  {
    id: "countdown-clash",
    title: "تحدي العد التنازلي",
    tagline: "سابق الزمن مع فريقك",
    description:
      "الفرق تتنافس لحل ألغاز صغيرة ضد عداد عملاق على التلفزيون.",
    players: "4-20",
    duration: "7-10 دقيقة",
    energy: "عالي",
    icon: Timer,
    gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
    glow: "rgba(99, 102, 241, 0.48)",
  },
]

const festiveSymbols = [
  { id: 1, symbol: "✦", left: "8%", top: "12%", delay: 0, duration: 8 },
  { id: 2, symbol: "✶", left: "18%", top: "78%", delay: 0.8, duration: 7.2 },
  { id: 3, symbol: "☾", left: "33%", top: "18%", delay: 1.4, duration: 9 },
  { id: 4, symbol: "✧", left: "50%", top: "84%", delay: 0.2, duration: 8.8 },
  { id: 5, symbol: "✺", left: "64%", top: "22%", delay: 1.1, duration: 7.5 },
  { id: 6, symbol: "✦", left: "78%", top: "70%", delay: 0.5, duration: 8.4 },
  { id: 7, symbol: "✧", left: "90%", top: "16%", delay: 1.6, duration: 9.5 },
]

const TRIVIA_GAME_ID = "family-trivia"

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

export default function Home() {
  const router = useRouter()
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isTVMode, setIsTVMode] = useState(false)

  useEffect(() => {
    let viewportMeta = document.querySelector('meta[name="viewport"]')
    if (!viewportMeta) {
      viewportMeta = document.createElement("meta")
      viewportMeta.setAttribute("name", "viewport")
      document.head.appendChild(viewportMeta)
    }

    if (isTVMode) {
      viewportMeta.setAttribute("content", "width=1280, initial-scale=0.3, user-scalable=yes")
    } else {
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      )
    }
  }, [isTVMode])

  const toggleFullscreen = () => {
    const doc = document as FullscreenDocument
    const el = document.documentElement as FullscreenElement

    const requestFullScreen =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen

    const exitFullScreen =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen

    if (
      !doc.fullscreenElement &&
      !doc.mozFullScreenElement &&
      !doc.webkitFullscreenElement &&
      !doc.msFullscreenElement
    ) {
      if (requestFullScreen) {
        const result = requestFullScreen.call(el)
        if (result && typeof result.catch === "function") {
          result.catch(() => setShowInstallPrompt(true))
        }
      } else {
        setShowInstallPrompt(true)
      }
    } else if (exitFullScreen) {
      exitFullScreen.call(doc)
    }
  }

  const startSequence = () => {
    router.push("/host/login")
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden transition-colors duration-1000 ease-in-out text-foreground"
      style={{
        background: `radial-gradient(circle at top, var(--festive-glow), transparent 50%), linear-gradient(160deg, var(--background) 0%, var(--secondary) 46%, var(--background) 100%)`
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[size:54px_54px] opacity-20"
        style={{
          backgroundImage: `linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)`
        }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[min(900px,92vw)] -translate-x-1/2 rounded-full blur-[120px] bg-violet-300/10 animate-glow-pulse"
      />
      <div className="pointer-events-none absolute -bottom-40 right-[-12%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/5 blur-[130px] animate-glow-pulse" />

      {/* Fireworks Effect - Increased for better visibility through glass */}
      <FireworksBackground
        population={1}
        particleSpeed={4}
        explosionHeight={{ min: 0, max: 0.15 }}
        className="absolute inset-0 z-0 pointer-events-none opacity-80"
      />
      <FireworksBackgroundDemo population={1.5} />

      {festiveSymbols.map((item) => (
        <motion.span
          key={item.id}
          className="pointer-events-none absolute text-xl text-primary/70 drop-shadow-[0_0_20px_var(--festive-glow)]"
          style={{ left: item.left, top: item.top }}
          initial={{ opacity: 0.15, y: 0, rotate: 0 }}
          animate={{ opacity: [0.2, 0.7, 0.2], y: [0, -18, 0], rotate: [0, 10, 0] }}
          transition={{
            duration: item.duration,
            repeat: Number.POSITIVE_INFINITY,
            delay: item.delay,
            ease: "easeInOut",
          }}
        >
          {item.symbol}
        </motion.span>
      ))}

      <main className="relative z-10 mx-auto flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4 text-center"
        >
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-violet-100 backdrop-blur-md sm:text-sm">
            <MoonStar className="size-4" />
            جمعة العيد العائلية
            <Sparkles className="size-4" />
          </div>

          <div className="absolute left-6 top-6 z-50 flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "rounded-full border-glass-border text-foreground transition-all backdrop-blur-md",
                isTVMode
                  ? "border-primary/50 bg-primary/20 text-primary"
                  : "bg-glass-bg hover:bg-glass-border"
              )}
              onClick={() => setIsTVMode(!isTVMode)}
            >
              <Monitor className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-glass-border bg-glass-bg text-foreground hover:bg-glass-border backdrop-blur-md"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </div>

          <h1 className={cn(
            "text-balance font-extrabold tracking-tight text-foreground drop-shadow-[0_12px_30px_rgba(0,0,0,0.15)] font-cairo transition-all duration-500",
            isTVMode ? "text-6xl sm:text-8xl lg:text-9xl mb-4" : "text-4xl sm:text-6xl lg:text-8xl"
          )}>
            اختر لعبة الليلة
          </h1>
          <p className={cn(
            "mx-auto max-w-4xl text-pretty text-slate-100/85 font-cairo transition-all duration-500",
            isTVMode ? "text-2xl sm:text-3xl lg:text-4xl opacity-100" : "text-base sm:text-xl"
          )}>
            صممت للشاشات الكبيرة. تسلسل فعاليات الليلة جاهز، اضغط ابدأ للبدء.
          </p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="pt-6"
          >
            <Button
              size="lg"
              onClick={startSequence}
              className={cn(
                "rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 font-bold text-slate-950 shadow-[0_20px_50px_-15px_rgba(139,92,246,0.5)] transition-all hover:scale-105 hover:shadow-fuchsia-500/40 active:scale-95",
                isTVMode ? "h-24 px-16 text-4xl" : "h-16 px-12 text-2xl"
              )}
            >
              <Sparkles className="mr-2 size-6" />
              ابدأ الفعالية الآن
            </Button>
          </motion.div>
        </motion.header>

        <section className="mt-12">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {games.map((game, index) => {
              const isSelected = game.id === TRIVIA_GAME_ID

              return (
                <motion.div
                  key={game.id}
                  className="text-right"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.35 }}
                >
                  <Card
                    className={cn(
                      "relative h-[30rem] overflow-hidden border-glass-border bg-glass-bg py-0 text-foreground backdrop-blur-xl shadow-xl",
                      isSelected
                        ? "border-primary/60 ring-2 ring-primary/20 bg-glass-bg"
                        : ""
                    )}
                  >
                    <div className="h-[42%] overflow-hidden relative">
                      <div className="absolute right-4 top-4 z-20 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-black text-white backdrop-blur-md border border-glass-border shadow-lg">
                        {index + 1}
                      </div>

                      {game.image ? (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${game.image})` }}
                        />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))] flex items-center justify-center">
                          <game.icon className="size-16 opacity-30" />
                        </div>
                      )}

                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage: `linear-gradient(to bottom, transparent 20%, var(--glass-bg) 70%, var(--card) 100%)`,
                        }}
                      />
                    </div>

                    <div className="relative h-1 w-full" style={{ backgroundImage: game.gradient }} />

                    <CardHeader className="gap-2 pt-6 pb-2">
                      <CardTitle className={cn(
                        "font-cairo font-black transition-all duration-300 tracking-tight",
                        isTVMode ? "text-4xl" : "text-3xl"
                      )}>{game.title}</CardTitle>
                      <CardDescription className={cn(
                        "text-violet-200/90 font-cairo transition-all duration-300 font-medium",
                        isTVMode ? "text-xl" : "text-base"
                      )}>{game.tagline}</CardDescription>
                    </CardHeader>

                    <CardContent className={cn(
                      "pb-8 text-foreground/90 font-cairo transition-all duration-300 leading-relaxed",
                      isTVMode ? "text-lg" : "text-base"
                    )}>
                      <p className="line-clamp-2 opacity-80">{game.description}</p>

                      <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="rounded-xl bg-glass-bg p-3 border border-glass-border backdrop-blur-md">
                          <div className="flex items-center gap-2 mb-1">
                            <Users className="size-4 text-primary" />
                            <p className="text-xs opacity-60">اللاعبين</p>
                          </div>
                          <p className="text-lg font-bold text-foreground">{game.players}</p>
                        </div>
                        <div className="rounded-xl bg-glass-bg p-3 border border-glass-border backdrop-blur-md">
                          <div className="flex items-center gap-2 mb-1">
                            <Timer className="size-4 text-cyan-500" />
                            <p className="text-xs opacity-60">المدة</p>
                          </div>
                          <p className="text-lg font-bold text-foreground">{game.duration}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </section>

        <motion.footer
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-5 rounded-2xl border border-white/20 bg-black/25 px-4 py-3 backdrop-blur-md sm:mt-6 sm:flex sm:items-center sm:justify-between sm:px-6"
        >
          <p className="flex items-center gap-2 text-sm text-violet-50/95 sm:text-base font-cairo">
            <Sparkles className="size-4 text-violet-200 ml-1" />
            نصيحة للعرض: خلو واحد هو المضيف والبقية يتوزعون فرق.
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/90 sm:mt-0 font-cairo">
            أجواء الاحتفال: شغالة
          </p>
        </motion.footer>
      </main>

      <AnimatePresence>
        {showInstallPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
            onClick={() => setShowInstallPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl text-center"
            >
              <button
                onClick={() => setShowInstallPrompt(false)}
                className="absolute left-4 top-4 rounded-full bg-white/5 p-2 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>

              <div className="flex flex-col items-center">
                <div className="mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 p-4 shadow-lg shadow-fuchsia-500/20">
                  <Maximize2 className="size-8 text-white" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-white font-cairo">الشاشة الكاملة على الآيفون</h3>
                <p className="mb-6 text-sm text-slate-400 font-cairo">
                  عشان تعيش التجربة كاملة، لازم تضيف التطبيق للشاشة الرئيسية.
                </p>

                <div className="w-full space-y-3 rounded-xl bg-white/5 p-4 text-right text-sm text-slate-300 font-cairo">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                      1
                    </span>
                    <span className="flex items-center gap-1">
                      اضغط زر المشاركة <Share2 className="mx-1 size-4 text-blue-400" />
                    </span>
                  </div>
                  <div className="h-px w-full bg-white/5" />
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                      2
                    </span>
                    <span>انزل تحت واختار</span>
                  </div>
                  <div className="flex items-center gap-3 pr-9 font-semibold text-white">
                    <div className="flex size-6 items-center justify-center rounded-[4px] border border-white/20 bg-gray-500/50 ml-2">
                      <span className="text-xs">+</span>
                    </div>
                    إضافة إلى الصفحة الرئيسية
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div >
  )
}
