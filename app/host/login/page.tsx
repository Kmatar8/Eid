"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

import FireworksBackgroundDemo from "@/components/fireworks-demo"
import { Button } from "@/components/ui/button"
import { FireworksBackground } from "@/components/ui/fireworks"
import { LiveApiError, hostActivate, hostLogin } from "@/lib/client/live-api"
import { getHostToken, setHostToken, setHostUsername } from "@/lib/client/live-session"

function toErrorMessage(error: unknown) {
  if (error instanceof LiveApiError) {
    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

export default function HostLoginPage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"login" | "activate">("login")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (getHostToken()) {
      router.replace("/host")
    }
  }, [router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response =
        mode === "activate" ? await hostActivate(code.trim(), password) : await hostLogin(code.trim(), password)
      setHostToken(response.token)
      setHostUsername(response.host.username)
      router.replace("/host")
    } catch (requestError) {
      if (requestError instanceof LiveApiError) {
        if (mode === "login" && requestError.code === "HOST_CODE_NOT_ACTIVATED") {
          setMode("activate")
          setError("هذا الكود غير مفعّل بعد. أدخل كلمة مرور جديدة لتفعيل الكود.")
          return
        }

        if (mode === "activate" && requestError.code === "HOST_CODE_ALREADY_ACTIVATED") {
          setMode("login")
          setError("هذا الكود مفعّل مسبقًا. استخدم تسجيل الدخول بكلمة المرور الحالية.")
          return
        }
      }
      setError(toErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <FireworksBackground population={1} particleSpeed={3} className="absolute inset-0 z-0 opacity-70" />
      <FireworksBackgroundDemo population={0.5} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.2),transparent_45%),linear-gradient(160deg,#09090b_0%,#1f1b4b_50%,#09090b_100%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-8">
        <section className="w-full max-w-md rounded-3xl border border-white/25 bg-black/45 p-6 backdrop-blur-xl sm:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-100/80">Host Access</p>
          <h1 className="mt-2 text-4xl font-extrabold">ابدأ الفعالية</h1>
          <p className="mt-2 text-sm text-slate-200">
            {mode === "activate"
              ? "فعّل الكود لأول مرة عبر تعيين كلمة مرور جديدة."
              : "أدخل الكود وكلمة المرور للدخول. إذا كان الكود جديدًا سيتم تحويلك للتفعيل."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm">
              الكود
              <input
                className="mt-1 w-full rounded-xl border border-white/25 bg-black/40 px-3 py-2 text-white placeholder:text-slate-400"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ABC123DEF456"
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-sm">
              {mode === "activate" ? "كلمة المرور الجديدة" : "كلمة المرور"}
              <input
                className="mt-1 w-full rounded-xl border border-white/25 bg-black/40 px-3 py-2 text-white placeholder:text-slate-400"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                type="password"
                required
              />
            </label>
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 font-bold text-slate-950"
              disabled={busy}
            >
              {busy ? (mode === "activate" ? "جاري التفعيل..." : "جاري تسجيل الدخول...") : mode === "activate" ? "تفعيل الكود" : "دخول المضيف"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-xl border border-white/20 text-slate-200 hover:bg-white/10"
              onClick={() => {
                setError(null)
                setMode((value) => (value === "login" ? "activate" : "login"))
              }}
              disabled={busy}
            >
              {mode === "activate" ? "لديك كلمة مرور بالفعل؟ تسجيل الدخول" : "أول مرة؟ فعّل الكود"}
            </Button>
          </form>

          {error ? <p className="mt-4 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p> : null}

          <p className="mt-4 text-center text-sm text-slate-300">
            رجوع إلى{" "}
            <Link href="/" className="text-violet-200 underline">
              الصفحة الرئيسية
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
