"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MonitorPlay } from "lucide-react"

interface MirroringEnforcerProps {
    children: React.ReactNode
}

/**
 * MirroringEnforcer
 * 
 * Flow:
 * 1. Checks if the user is on a mobile device.
 * 2. If mobile and in portrait mode: Shows a strictly blocking prompt asking the user to rotate to landscape.
 * 3. If mobile and in landscape mode: Renders the children inside a 1280x720 container that is CSS-scaled to fit the physical screen height. This provides a perfect 16:9 desktop-like ratio for mirroring to a TV.
 * 4. If desktop/tablet: Renders children normally.
 */
export function MirroringEnforcer({ children }: MirroringEnforcerProps) {
    const [isMobile, setIsMobile] = useState(false)
    const [isPortrait, setIsPortrait] = useState(false)
    const [scale, setScale] = useState(1)

    useEffect(() => {
        const checkOrientationAndDevice = () => {
            // Basic mobile check (similar to existing logic but focused on width and touch)
            const isMobileDevice = window.innerWidth < 1024 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
            setIsMobile(isMobileDevice)

            const portrait = window.innerHeight > window.innerWidth
            setIsPortrait(portrait)

            if (isMobileDevice && !portrait) {
                // Landscape mobile - calculate scale to fit the 720px height virtual container
                const availableHeight = window.innerHeight
                const targetHeight = 720
                // Scale to fit height primarily, as widths on phones are usually very wide in landscape.
                const calculatedScale = Math.min(availableHeight / targetHeight, 1)
                setScale(calculatedScale)
            } else {
                setScale(1)
            }
        }

        checkOrientationAndDevice()
        window.addEventListener("resize", checkOrientationAndDevice)
        window.addEventListener("orientationchange", checkOrientationAndDevice)

        return () => {
            window.removeEventListener("resize", checkOrientationAndDevice)
            window.removeEventListener("orientationchange", checkOrientationAndDevice)
        }
    }, [])

    // If mobile and portrait, show the blocking orientation prompt
    if (isMobile && isPortrait) {
        return (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white p-6 text-center">
                <MonitorPlay className="w-20 h-20 text-amber-400 mb-6 animate-pulse" />
                <h2 className="text-3xl font-black mb-4 font-cairo text-amber-100">أدر جهازك بالعرض</h2>
                <p className="text-lg text-slate-300 max-w-md">
                    للحصول على أفضل تجربة عند العرض على التلفزيون، يرجى تدوير جهازك للوضع الأفقي (Landscape).
                </p>
                <p className="mt-4 text-sm text-cyan-200">
                    تأكد من إلغاء قفل دوران الشاشة في جهازك.
                </p>
            </div>
        )
    }

    // If mobile and landscape, force the 1280x720 Desktop View scaled to fit
    if (isMobile && !isPortrait) {
        return (
            <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
                <div
                    className="w-[1280px] h-[720px] shrink-0 origin-center bg-background text-foreground"
                    style={{
                        transform: `scale(${scale})`,
                    }}
                >
                    {children}
                </div>
            </div>
        )
    }

    // Default behavior (Desktop/Tablet)
    return <>{children}</>
}
