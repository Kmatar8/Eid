"use client"

import { MonitorX } from "lucide-react"

import { cn } from "@/lib/utils"

type LaptopOnlyOverlayProps = {
  title?: string
  description?: string
  className?: string
}

const DEFAULT_TITLE = "هذه الصفحة تعمل على اللابتوب فقط"
const DEFAULT_DESCRIPTION = "افتحها من شاشة لابتوب أو كمبيوتر لإكمال استخدام المنصة."

export function LaptopOnlyOverlay({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  className,
}: LaptopOnlyOverlayProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-6 text-white backdrop-blur-md lg:hidden",
        className
      )}
    >
      <div className="w-full max-w-md rounded-3xl border border-amber-200/35 bg-slate-950/95 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-300/15 text-amber-300">
          <MonitorX className="h-8 w-8" />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200/90">Laptop Only</p>
        <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-200">{description}</p>
        <p className="mt-3 text-xs text-slate-400">سيتم إخفاء هذه الرسالة تلقائيًا عند فتح الصفحة من شاشة لابتوب.</p>
      </div>
    </div>
  )
}
