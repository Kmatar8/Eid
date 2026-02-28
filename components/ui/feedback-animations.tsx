"use client"

import { useEffect } from "react"
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
}: {
  currentStatus: FeedbackType
  scoreDelta?: number | null
  onComplete?: () => void
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
              {[...Array(36)].map((_, i) => {
                const angle = (i * 360) / 36 + (Math.random() * 20 - 10)
                const distance = 140 + Math.random() * 450 // Much larger spread across overlay
                const size = 2.5 + Math.random() * 3.5 // Bigger sticker sizes
                const emojis = ["❌", "😭", "💔", "👎", "🫠", "🚫", "🤦", "☠️", "🚨", "💥"]
                const emoji = emojis[i % emojis.length]

                return (
                  <motion.div
                    key={`wrong-sticker-${i}`}
                    className="absolute z-10"
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                    animate={{
                      x: Math.cos((angle * Math.PI) / 180) * distance,
                      y: Math.sin((angle * Math.PI) / 180) * distance + (Math.random() * 150),
                      scale: [0, 1.2, 1],
                      opacity: [0, 1],
                      rotate: Math.random() * 360 - 180,
                    }}
                    transition={{
                      duration: 0.8 + Math.random() * 0.4,
                      ease: [0.175, 0.885, 0.32, 1.275], // slight spring ease
                      delay: Math.random() * 0.1,
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
              })}
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
