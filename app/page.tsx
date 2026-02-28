"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  Brain,
  Maximize2,
  Monitor,
  MoonStar,
  Paintbrush2,
  Share2,
  ShoppingCart,
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
import { BorderBeam } from "@/components/ui/border-beam"

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
          className="space-y-4 text-center mt-2 relative z-50 pt-4"
        >
          <div className="mx-auto mb-6 w-fit relative z-50">
            <a
              href="https://www.tiktok.com/@happytiime"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex z-50 items-center gap-2 overflow-hidden rounded-full border border-white/20 bg-slate-950/80 px-5 py-2 text-base font-bold text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-slate-900"
            >
              <BorderBeam
                duration={4}
                size={140}
                className="from-transparent via-cyan-400 to-transparent"
              />
              <BorderBeam
                duration={4}
                delay={2}
                size={140}
                borderWidth={1.5}
                className="from-transparent via-fuchsia-400 to-transparent"
              />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 15.68a6.34 6.34 0 0 0 6.27 6.36 6.34 6.34 0 0 0 6.25-6.36V7.94a8.27 8.27 0 0 0 3.76.92V5.38a5.04 5.04 0 0 1-1.69-.69z" />
              </svg>
              @happytiime
            </a>
          </div>

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
            فعالية العيد، <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500">لعب وتحدي</span>
          </h1>
          <p className={cn(
            "mx-auto max-w-4xl text-pretty text-slate-100/85 font-cairo transition-all duration-500",
            isTVMode ? "text-2xl sm:text-3xl lg:text-4xl opacity-100" : "text-base sm:text-xl"
          )}>
            جاهزين للمنافسة؟ اجمع العائلة، وزع الفرق، وابدأ التحدي الآن على الشاشة الكبيرة.
          </p>
        </motion.header>

        {/* Hero Game Section (Family Trivia) */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-12 w-full max-w-5xl"
        >
          <div className="group relative overflow-hidden rounded-[2.75rem] border border-white/20 bg-slate-950/50 shadow-[0_28px_120px_rgba(6,182,212,0.24)]">
            <Image
              src="/images/landing-hero.jpg"
              alt="أجواء فعالية العيد العائلية"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1200px"
              className="object-cover object-center transition-transform duration-[1400ms] group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-900/20" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(251,191,36,0.34),transparent_46%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.24),transparent_42%)]" />

            <div className="relative z-10 flex min-h-[27rem] flex-col justify-end gap-5 p-5 sm:min-h-[31rem] sm:p-8 lg:min-h-[34rem] lg:p-12">
              <span className="inline-flex w-fit items-center rounded-full border border-amber-300/40 bg-black/50 px-4 py-2 text-xs font-bold tracking-[0.18em] text-amber-200 backdrop-blur-md">
                اللعبة الرئيسية
              </span>

              <h2
                className={cn(
                  "max-w-2xl font-cairo font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 drop-shadow-[0_8px_22px_rgba(0,0,0,0.55)]",
                  isTVMode ? "text-6xl" : "text-4xl sm:text-5xl"
                )}
              >
                مسابقات العائلة
              </h2>
              <p className="max-w-2xl text-lg font-medium text-cyan-100/95 drop-shadow-[0_8px_22px_rgba(0,0,0,0.6)] sm:text-xl">
                قصص، ذكريات، ومفاجآت
              </p>
              <p className="max-w-2xl text-base leading-relaxed text-slate-100/95 drop-shadow-[0_8px_20px_rgba(0,0,0,0.62)] sm:text-lg">
                اختبر معلوماتكم عن قصص العائلة، التقاليد، ومواقف العيد المضحكة في تجربة تفاعلية مليئة بالحماس والضحك.
              </p>

              <div className="mt-2 grid max-w-2xl gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  onClick={() => {
                    // TODO: Add purchase link here when provided by the user
                    window.open("#", "_blank")
                  }}
                  className={cn(
                    "h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-pink-400 to-cyan-400 text-lg font-black text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.35)] transition-all hover:scale-[1.02] active:scale-[0.98] sm:h-16",
                    isTVMode ? "text-2xl" : ""
                  )}
                >
                  <ShoppingCart className="mr-2 size-6 text-slate-900" />
                  شراء اللعبة
                </Button>

                <Button
                  size="lg"
                  onClick={startSequence}
                  className={cn(
                    "h-14 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-lg font-bold text-white shadow-[0_10px_30px_-10px_rgba(6,182,212,0.6)] transition-all hover:scale-[1.02] hover:from-cyan-400 hover:to-indigo-500 active:scale-[0.98] sm:h-16",
                    isTVMode ? "text-2xl" : ""
                  )}
                >
                  <Sparkles className="mr-2 size-6 text-cyan-100" />
                  ابدأ الفعالية الآن
                </Button>
              </div>
            </div>
          </div>
        </motion.section>



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
