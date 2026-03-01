"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessageCircle, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: string
  role: "assistant" | "user"
  text: string
}

type ChatApiResponse = {
  reply?: string
}

const CUSTOMER_HISTORY_LIMIT = 20
const MAX_MESSAGE_LENGTH = 800

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const initialAssistantMessage: ChatMessage = {
  id: "initial-assistant-message",
  role: "assistant",
  text: "هلا فيك وكل عام وانت بخير وكل من يعز عليك، قولي كيف اقدر اساعدك .",
}

export function LandingChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage])

  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isSending, isOpen])

  const canSend = useMemo(() => {
    return inputValue.trim().length > 0 && !isSending
  }, [inputValue, isSending])

  const sendMessage = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: "user",
      text: trimmed,
    }

    const nextMessages = [...messages, userMessage]
    const customerHistory = nextMessages
      .filter((message) => message.role === "user")
      .map((message) => message.text)
      .slice(-CUSTOMER_HISTORY_LIMIT)

    setMessages(nextMessages)
    setInputValue("")
    setErrorMessage(null)
    setIsSending(true)

    try {
      const response = await fetch("/api/chat/support", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          message: trimmed,
          customerHistory,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as ChatApiResponse
      const replyText = typeof payload.reply === "string" ? payload.reply.trim() : ""

      if (!response.ok) {
        setErrorMessage("تعذر الرد الآن. حاول مرة أخرى بعد قليل.")
        return
      }

      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: "assistant",
          text: replyText || "تعذر تجهيز رد مناسب الآن.",
        },
      ])
    } catch {
      setErrorMessage("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex items-end justify-end">
      <AnimatePresence mode="wait">
        {!isOpen ? (
          <motion.button
            key="chat-open-button"
            type="button"
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.22 }}
            onClick={() => setIsOpen(true)}
            className="group relative isolate h-14 w-14 rounded-full border border-cyan-200/70 bg-gradient-to-br from-cyan-400 to-indigo-500 text-white shadow-[0_12px_30px_rgba(6,182,212,0.45)] outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-cyan-200"
            aria-label="فتح محادثة الدعم"
          >
            <span className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-cyan-300/45 animate-ping" />
            <span className="pointer-events-none absolute inset-0 rounded-full bg-white/8 animate-pulse" />
            <MessageCircle className="mx-auto size-6" />
          </motion.button>
        ) : (
          <motion.section
            key="chat-panel"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.24 }}
            className="w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-white/20 bg-slate-950/95 shadow-[0_24px_60px_rgba(2,6,23,0.55)] backdrop-blur-md"
            dir="rtl"
          >
            <header className="flex items-center justify-between border-b border-white/15 bg-gradient-to-r from-cyan-600/80 to-indigo-600/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/15">
                  <MessageCircle className="size-4 text-cyan-50" />
                </span>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">سارة</p>
                  <p className="text-[11px] text-cyan-100/90">دعم فني ٢٤ ساعة</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full bg-white/10 p-1.5 text-white/85 transition-colors hover:bg-white/20"
                onClick={() => setIsOpen(false)}
                aria-label="إغلاق المحادثة"
              >
                <X className="size-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="max-h-[58vh] min-h-72 space-y-3 overflow-y-auto bg-slate-950/70 px-3 py-3 sm:max-h-[26rem]"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-start" : "justify-end"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      message.role === "user"
                        ? "rounded-br-sm bg-white/10 text-slate-100"
                        : "rounded-bl-sm bg-cyan-500/20 text-cyan-50 border border-cyan-300/20"
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-bl-sm border border-cyan-300/20 bg-cyan-500/20 px-3 py-2 text-xs text-cyan-100">
                    جاري تجهيز الرد...
                  </div>
                </div>
              )}
            </div>

            <footer className="border-t border-white/15 bg-slate-950/80 p-3">
              {errorMessage && (
                <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                  {errorMessage}
                </p>
              )}
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage()
                }}
              >
                <input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="اكتب سؤالك هنا..."
                  className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-slate-300/70 outline-none transition-colors focus:border-cyan-300/70"
                  maxLength={MAX_MESSAGE_LENGTH}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  className="h-11 w-11 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
