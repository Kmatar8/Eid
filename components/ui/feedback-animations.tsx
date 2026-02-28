"use client"

import { useEffect, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { Check, X } from "lucide-react"

type FeedbackType = "correct" | "wrong" | null

function formatScoreDelta(score: number) {
  return score >= 0 ? `+${score}` : `${score}`
}

export function FeedbackOverlay({
  currentStatus,
  scoreDelta,
  onComplete,
  showStickers = true,
}: {
  currentStatus: FeedbackType
  scoreDelta?: number | null
  onComplete?: () => void
  showStickers?: boolean
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

  const wrongStickers = useMemo(() => {
    if (currentStatus !== "wrong") return []

    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768
    const sizeMultiplier = isMobile ? 0.6 : 1

    return [...Array(36)].map((_, i) => {
      const angle = (i * 360) / 36 + (Math.random() * 20 - 10)

      // Push the minimum distance out so they clear the 150px central icon
      const minDistance = isMobile ? 180 : 280
      const spread = isMobile ? 150 : 350
      const distance = minDistance + Math.random() * spread

      const size = (2.5 + Math.random() * 3.5) * sizeMultiplier
      const emojis = ["❌", "😭", "💔", "👎", "🫠", "🚫", "🤦", "☠️", "🚨", "💥"]
      const emoji = emojis[i % emojis.length]

      const rad = (angle * Math.PI) / 180
      const x = Math.cos(rad) * distance

      // If the particle is falling downwards, push it even further down to clear the huge score text
      let y = Math.sin(rad) * distance
      if (y > 0) {
        y += isMobile ? 110 : 180
      }

      const rotate = Math.random() * 360 - 180
      const duration = 0.8 + Math.random() * 0.4
      const delay = Math.random() * 0.1

      return { i, emoji, size, x, y, rotate, duration, delay }
    })
  }, [currentStatus])

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

              {/* Massive spread of Wrong Answer Stickers */}
              {showStickers && wrongStickers.map(({ i, emoji, size, x, y, rotate, duration, delay }) => (
                <motion.div
                  key={`wrong-sticker-${i}`}
                  className="absolute z-10"
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                  animate={{
                    x,
                    y,
                    scale: [0, 1.2, 1],
                    opacity: [0, 1],
                    rotate,
                  }}
                  transition={{
                    duration,
                    ease: [0.175, 0.885, 0.32, 1.275], // slight spring ease
                    delay,
                  }}
                >
                  <span
                    style={{
                      fontSize: `${size}rem`,
                      filter: "drop-shadow(0px 8px 16px rgba(0,0,0,0.6))",
                      display: "block",
                    }}
                  >
                    {emoji}
                  </span>
                </motion.div>
              )
              )}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
