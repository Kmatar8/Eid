"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, X } from "lucide-react"

type FeedbackType = "correct" | "wrong" | null

export function FeedbackOverlay({
  currentStatus,
  onComplete,
}: {
  currentStatus: FeedbackType
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
            className="relative z-10 flex items-center justify-center"
          >
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
            className="relative z-10 flex items-center justify-center"
          >
            <div className="absolute -inset-10 rounded-full bg-red-600/20 blur-2xl" />
            <div className="rounded-full border-4 border-red-100 bg-gradient-to-br from-red-500 to-rose-700 p-8 shadow-[0_0_50px_rgba(239,68,68,0.5)]">
              <X className="h-20 w-20 text-white" strokeWidth={4} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
