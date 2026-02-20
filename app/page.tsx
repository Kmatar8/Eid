"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import {
  Brain,
  Gamepad2,
  Maximize2,
  Monitor,
  MoonStar,
  Paintbrush2,
  PartyPopper,
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

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

export default function Home() {
  const [selectedGameId, setSelectedGameId] = useState(games[0].id)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isTVMode, setIsTVMode] = useState(false)

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? games[0],
    [selectedGameId]
  )

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
    const doc = document as any
    const el = document.documentElement as any

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

  const cycleGame = () => {
    const currentIndex = games.findIndex((game) => game.id === selectedGame.id)
    const nextIndex = (currentIndex + 1) % games.length
    setSelectedGameId(games[nextIndex].id)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.22),_transparent_42%),linear-gradient(160deg,_#12221b_0%,_#171d34_46%,_#331722_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:54px_54px] opacity-20" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[min(900px,92vw)] -translate-x-1/2 rounded-full bg-amber-300/25 blur-[120px] animate-glow-pulse" />
      <div className="pointer-events-none absolute -bottom-40 right-[-12%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/20 blur-[130px] animate-glow-pulse" />

      {/* Fireworks Effect */}
      <FireworksBackground
        population={2}
        particleSpeed={3}
        explosionHeight={{ min: 0, max: 0.15 }}
        className="absolute inset-0 z-0 pointer-events-none opacity-50"
      />
      <FireworksBackgroundDemo population={1} />

      {festiveSymbols.map((item) => (
        <motion.span
          key={item.id}
          className="pointer-events-none absolute text-xl text-amber-100/70 drop-shadow-[0_0_20px_rgba(251,191,36,0.65)]"
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
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-amber-100 backdrop-blur-md sm:text-sm">
            <MoonStar className="size-4" />
            جمعة العيد العائلية
            <Sparkles className="size-4" />
          </div>

          <div className="absolute left-6 top-6 z-50 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "rounded-full border-white/20 text-white transition-all",
                isTVMode
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                  : "bg-white/10 hover:bg-white/20"
              )}
              onClick={() => setIsTVMode(!isTVMode)}
            >
              <Monitor className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          </div>

          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-8xl font-cairo">
            اختر لعبة الليلة
          </h1>
          <p className="mx-auto max-w-3xl text-pretty text-base text-slate-100/85 sm:text-xl font-cairo">
            صممت للشاشات الكبيرة. اختر لعبة، وزع الفرق، واستمتع بأجواء العيد المبهجة طوال الليل.
          </p>
        </motion.header>

        <section className="mt-8 grid gap-6 xl:mt-10 xl:grid-cols-[1fr_2fr]">
          <motion.div
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <Card className="relative h-full overflow-hidden border-white/25 bg-black/30 py-0 backdrop-blur-xl">
              {selectedGame.image ? (
                <>
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out opacity-80"
                    style={{ backgroundImage: `url(${selectedGame.image})` }}
                  />
                  {/* Removed heavy gradient */}
                  <div className="h-1.5 w-full relative z-10" style={{ backgroundImage: selectedGame.gradient }} />
                </>
              ) : (
                <>
                  <div className="h-1.5 w-full" style={{ backgroundImage: selectedGame.gradient }} />
                  <div className="absolute -left-20 -top-24 size-56 rounded-full bg-white/10 blur-3xl" />
                </>
              )}
              {/* Removed pointer-events-none gradient */}

              <CardHeader className="relative gap-4 pt-8">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="grid size-16 place-items-center rounded-2xl shadow-lg animate-float-soft"
                    style={{
                      backgroundImage: selectedGame.gradient,
                      boxShadow: `0 18px 40px -16px ${selectedGame.glow}`,
                    }}
                  >
                    <selectedGame.icon className="size-8 text-white" />
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/90">
                    مختارة
                  </span>
                </div>

                <CardTitle className="text-3xl leading-tight text-white sm:text-4xl font-cairo">
                  {selectedGame.title}
                </CardTitle>
                <CardDescription className="text-base text-amber-100/95 font-cairo">
                  {selectedGame.tagline}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 text-slate-100/90 font-cairo">
                <p className="text-base leading-relaxed sm:text-lg">{selectedGame.description}</p>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <InfoPill icon={Users} label="اللاعبين" value={selectedGame.players} />
                  <InfoPill icon={Timer} label="الجولة" value={selectedGame.duration} />
                  <InfoPill icon={Zap} label="الحماس" value={selectedGame.energy} />
                </div>
              </CardContent>

              <CardFooter className="flex flex-wrap gap-3 border-t border-white/15 pb-7 pt-6">
                <Button
                  size="lg"
                  className="h-12 min-w-[220px] flex-1 rounded-full px-7 text-base font-bold text-slate-950 transition-transform hover:-translate-y-0.5 font-cairo"
                  style={{
                    backgroundImage: selectedGame.gradient,
                    boxShadow: `0 16px 35px -18px ${selectedGame.glow}`,
                  }}
                >
                  <Gamepad2 className="size-5 ml-2" />
                  ابدأ {selectedGame.title}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={cycleGame}
                  className="h-12 min-w-[170px] rounded-full border-white/30 bg-white/10 px-6 text-sm font-semibold text-white hover:bg-white hover:text-slate-900 font-cairo"
                >
                  <PartyPopper className="size-5 ml-2" />
                  اختيار عشوائي
                </Button>
              </CardFooter>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {games.map((game, index) => {
              const isSelected = game.id === selectedGameId

              return (
                <motion.button
                  key={game.id}
                  type="button"
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.18 + index * 0.08, duration: 0.35 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  onClick={() => setSelectedGameId(game.id)}
                  className="text-right"
                >
                  <Card
                    className={cn(
                      "group relative h-full overflow-hidden border-white/20 bg-white/5 py-0 text-white backdrop-blur-lg transition-all duration-300",
                      isSelected
                        ? "border-white/60 bg-white/20 shadow-[0_20px_55px_-28px_rgba(255,255,255,0.8)]"
                        : "hover:border-white/40 hover:bg-white/15"
                    )}
                    style={{
                      boxShadow: isSelected ? `0 18px 40px -20px ${game.glow}` : undefined,
                    }}
                  >
                    {game.image ? (
                      <>
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-all duration-500 opacity-60 group-hover:opacity-100"
                          style={{ backgroundImage: `url(${game.image})` }}
                        />
                        {/* Removed dark overlay */}
                        <div className="h-1.5 w-full relative z-10" style={{ backgroundImage: game.gradient }} />
                      </>
                    ) : (
                      <div className="h-1.5 w-full" style={{ backgroundImage: game.gradient }} />
                    )}

                    <CardHeader className="gap-3 pt-6 relative z-10">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="grid size-12 place-items-center rounded-xl"
                          style={{
                            backgroundImage: game.gradient,
                            boxShadow: `0 12px 26px -14px ${game.glow}`,
                          }}
                        >
                          <game.icon className="size-6 text-white" />
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]",
                            isSelected
                              ? "border-amber-200/70 bg-amber-200/20 text-amber-100"
                              : "border-white/25 bg-white/10 text-white/80"
                          )}
                        >
                          {isSelected ? "التالي" : "اختر"}
                        </span>
                      </div>
                      <CardTitle className="text-2xl leading-tight font-cairo">{game.title}</CardTitle>
                      <CardDescription className="text-sm text-white/80 font-cairo">{game.tagline}</CardDescription>
                    </CardHeader>

                    <CardContent className="pb-6 text-sm text-white/80 font-cairo">
                      <p>{game.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">
                          {game.players} لاعب
                        </span>
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">
                          {game.duration}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.button>
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
          <p className="flex items-center gap-2 text-sm text-amber-50/95 sm:text-base font-cairo">
            <Sparkles className="size-4 text-amber-200 ml-1" />
            نصيحة للعرض: خلو واحد هو "المضيف" والبقية يتوزعون فرق.
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
                <div className="mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 p-4 shadow-lg shadow-orange-500/20">
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
    </div>
  )
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-100/75">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-sm font-bold text-white sm:text-base">{value}</div>
    </div>
  )
}
