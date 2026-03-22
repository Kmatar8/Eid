"use client"

import { useEffect, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, X } from "lucide-react"

type FeedbackType = "correct" | "wrong" | null
export type FeedbackReason = "correct" | "wrong" | "timeout" | "no_buzz" | "host_skip"
export type FeedbackOverlayContext = {
  playerName: string
  teamName: string
  points: number
  reason?: FeedbackReason
  detailText?: string
}

function formatScoreDelta(score: number) {
  return score >= 0 ? `+${score}` : `${score}`
}

export function FeedbackOverlay({
  currentStatus,
  scoreDelta,
  context,
  onComplete,
  correctSummaryPanelClassName,
}: {
  currentStatus: FeedbackType
  scoreDelta?: number | null
  context?: FeedbackOverlayContext | null
  onComplete?: () => void
  correctSummaryPanelClassName?: string
}) {
  useEffect(() => {
    if (!currentStatus) {
      return
    }

    const timer = window.setTimeout(() => {
      onComplete?.()
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [currentStatus, onComplete])

  const feedbackSummary = useMemo(() => {
    if (!currentStatus || !context) {
      return null
    }

    const opener =
      context.reason === "timeout"
        ? "انتهى الوقت على"
        : currentStatus === "correct"
          ? "إجابة صحيحة من"
          : "إجابة خاطئة من"

    if (context.detailText) {
      return {
        opener,
        playerName: context.playerName,
        impactText: context.detailText,
      }
    }

    const absolutePoints = Math.abs(context.points)
    if (absolutePoints === 0) {
      return {
        opener,
        playerName: context.playerName,
        impactText: `بدون تغيير نقاط فريق ${context.teamName}`,
      }
    }

    const verb = context.points > 0 ? "تمت إضافة" : "تم خصم"
    const direction = context.points > 0 ? "إلى فريق" : "من فريق"
    return {
      opener,
      playerName: context.playerName,
      impactText: `${verb} ${absolutePoints} ${direction} ${context.teamName}`,
    }
  }, [context, currentStatus])

  return (
    <AnimatePresence>
      {currentStatus === "correct" && (
        <motion.div
          key="correct"
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.5, 0] }}
            transition={{ duration: 1.5 }}
          />

          <motion.div
            initial={{ scale: 0, y: 100, rotate: -45 }}
            animate={{
              scale: [0, 1.2, 1],
              y: [100, -20, 0],
              rotate: [-45, 10, 0],
            }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="relative z-10 flex flex-col items-center justify-center gap-4"
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute -inset-10 animate-pulse rounded-full bg-emerald-500/20 blur-2xl" />
              <div className="rounded-full border-4 border-emerald-100 bg-gradient-to-br from-emerald-400 to-green-600 p-8 shadow-[0_0_50px_rgba(16,185,129,0.5)]">
                <Check className="h-20 w-20 text-white" strokeWidth={4} />
              </div>

              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={`particle-${i}`}
                  className="absolute h-4 w-4 rounded-full bg-emerald-400"
                  initial={{ x: 0, y: 0, scale: 0 }}
                  animate={{
                    x: Math.cos((i * 45 * Math.PI) / 180) * 150,
                    y: Math.sin((i * 45 * Math.PI) / 180) * 150,
                    scale: [0, 1, 0],
                    opacity: [1, 0],
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              ))}
            </div>

            {typeof scoreDelta === "number" ? (
              <motion.p
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="text-8xl font-black leading-none text-[#00ff66] drop-shadow-[0_0_26px_rgba(16,255,130,0.85)]"
              >
                {formatScoreDelta(scoreDelta)}
              </motion.p>
            ) : null}

            {feedbackSummary ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className={`rounded-2xl border px-6 py-4 text-center shadow-xl ${correctSummaryPanelClassName ?? "border-emerald-200/45 bg-black/35"}`}
              >
                <p className="text-lg font-bold text-emerald-100">{feedbackSummary.opener}</p>
                <p className="mt-1 text-3xl font-black text-white">{feedbackSummary.playerName}</p>
                <p className="mt-2 text-lg font-semibold text-emerald-50">{feedbackSummary.impactText}</p>
              </motion.div>
            ) : null}
          </motion.div>
        </motion.div>
      )}

      {currentStatus === "wrong" && (
        <motion.div
          key="wrong"
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-red-600/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.6 }}
          />

          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.2, 1],
              opacity: 1,
              x: [0, -15, 15, -15, 15, 0],
            }}
            transition={{ duration: 0.5, type: "spring" }}
            className="relative z-10 flex flex-col items-center justify-center gap-4"
          >
            <div className="relative flex h-[360px] w-[520px] items-center justify-center">
              <div className="absolute -inset-10 rounded-full bg-red-600/20 blur-2xl" />
              <div className="rounded-full border-4 border-red-100 bg-gradient-to-br from-red-500 to-rose-700 p-8 shadow-[0_0_50px_rgba(239,68,68,0.5)] z-20">
                <X className="h-20 w-20 text-white" strokeWidth={4} />
              </div>
            </div>

            {typeof scoreDelta === "number" ? (
              <motion.p
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="text-8xl font-black leading-none text-[#ff1f3d] drop-shadow-[0_0_26px_rgba(255,31,61,0.85)]"
              >
                {formatScoreDelta(scoreDelta)}
              </motion.p>
            ) : null}

            {feedbackSummary ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="rounded-2xl border border-red-200/45 bg-black/35 px-6 py-4 text-center shadow-xl"
              >
                <p className="text-lg font-bold text-rose-100">{feedbackSummary.opener}</p>
                <p className="mt-1 text-3xl font-black text-white">{feedbackSummary.playerName}</p>
                <p className="mt-2 text-lg font-semibold text-rose-50">{feedbackSummary.impactText}</p>
              </motion.div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
