"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X } from "lucide-react"

type FeedbackType = "correct" | "wrong" | null

export function FeedbackOverlay({
    currentStatus,
    onComplete
}: {
    currentStatus: FeedbackType
    onComplete?: () => void
}) {
    const [internalStatus, setInternalStatus] = useState<FeedbackType>(null)

    useEffect(() => {
        if (currentStatus) {
            setInternalStatus(currentStatus)
            const timer = setTimeout(() => {
                setInternalStatus(null)
                onComplete?.()
            }, 2500)
            return () => clearTimeout(timer)
        }
    }, [currentStatus, onComplete])

    return (
        <AnimatePresence>
            {internalStatus === "correct" && (
                <motion.div
                    key="correct"
                    className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Subtle Flash */}
                    <motion.div
                        className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.5, 0] }}
                        transition={{ duration: 1.5 }}
                    />

                    {/* Confetti / Pop burst */}
                    <motion.div
                        initial={{ scale: 0, y: 100, rotate: -45 }}
                        animate={{
                            scale: [0, 1.2, 1],
                            y: [100, -20, 0],
                            rotate: [-45, 10, 0]
                        }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        className="relative flex items-center justify-center z-10"
                    >
                        <div className="absolute -inset-10 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
                        <div className="rounded-full bg-gradient-to-br from-emerald-400 to-green-600 p-8 shadow-[0_0_50px_rgba(16,185,129,0.5)] border-4 border-emerald-100">
                            <Check className="w-20 h-20 text-white" strokeWidth={4} />
                        </div>

                        {/* Popgun particles */}
                        {[...Array(8)].map((_, i) => (
                            <motion.div
                                key={`particle-${i}`}
                                className="absolute w-4 h-4 rounded-full bg-emerald-400"
                                initial={{ x: 0, y: 0, scale: 0 }}
                                animate={{
                                    x: Math.cos((i * 45 * Math.PI) / 180) * 150,
                                    y: Math.sin((i * 45 * Math.PI) / 180) * 150,
                                    scale: [0, 1, 0],
                                    opacity: [1, 0]
                                }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        ))}
                    </motion.div>
                </motion.div>
            )}

            {internalStatus === "wrong" && (
                <motion.div
                    key="wrong"
                    className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Red Warning/Bonk Flash */}
                    <motion.div
                        className="absolute inset-0 bg-red-600/20 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.6 }}
                    />

                    {/* X shaking icon */}
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{
                            scale: [0, 1.2, 1],
                            opacity: 1,
                            x: [0, -15, 15, -15, 15, 0]
                        }}
                        transition={{ duration: 0.5, type: "spring" }}
                        className="relative flex items-center justify-center z-10"
                    >
                        <div className="absolute -inset-10 bg-red-600/20 rounded-full blur-2xl" />
                        <div className="rounded-full bg-gradient-to-br from-red-500 to-rose-700 p-8 shadow-[0_0_50px_rgba(239,68,68,0.5)] border-4 border-red-100">
                            <X className="w-20 h-20 text-white" strokeWidth={4} />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
