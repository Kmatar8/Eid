"use client"

import type { ReactNode } from "react"

import { LaptopOnlyOverlay } from "@/components/laptop-only-overlay"

interface MirroringEnforcerProps {
  children: ReactNode
}

export function MirroringEnforcer({ children }: MirroringEnforcerProps) {
  return (
    <>
      <LaptopOnlyOverlay
        title="تشغيل المضيف متاح على اللابتوب فقط"
        description="استخدام واجهة المضيف وعرض الغرفة يحتاج شاشة لابتوب أو كمبيوتر."
      />
      <div className="hidden lg:block">{children}</div>
    </>
  )
}
