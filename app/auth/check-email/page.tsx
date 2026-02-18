"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useSignUp } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks"
import { ArrowRight } from "lucide-react"

export default function CheckEmailPage() {
  const { isLoaded, signUp, setActive } = useSignUp()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [email, setEmail] = useState("")

  useEffect(() => {
    const emailFromSignUp = signUp?.emailAddress ?? ""
    const emailFromQuery = searchParams.get("email") ?? ""
    setEmail(emailFromSignUp || emailFromQuery)
  }, [searchParams, signUp?.emailAddress])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleResendCode = async () => {
    if (!isLoaded || !signUp) {
      toast({
        title: "Start again",
        description: "Please begin signup again to request a new verification code.",
        variant: "destructive",
      })
      router.push("/auth/signup")
      return
    }

    setSending(true)
    try {
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      setCountdown(60)
      toast({
        title: "Code sent",
        description: "A new verification code was sent to your email.",
      })
    } catch (error) {
      const firstError = (
        error as {
          errors?: Array<{ longMessage?: string; message?: string }>
        }
      )?.errors?.[0]

      toast({
        title: "Unable to resend",
        description:
          firstError?.longMessage ??
          firstError?.message ??
          "Please wait a moment and try again.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!isLoaded || !signUp) {
      toast({
        title: "Start again",
        description: "Your signup session expired. Please sign up again.",
        variant: "destructive",
      })
      router.push("/auth/signup")
      return
    }

    if (code.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit verification code.",
        variant: "destructive",
      })
      return
    }

    setVerifying(true)
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
        await fetch("/api/auth/ensure-profile", { method: "POST" })

        toast({
          title: "Email verified",
          description: "Your account is ready. Let's finish onboarding.",
        })

        router.push("/onboarding")
        return
      }

      toast({
        title: "Verification incomplete",
        description: "Please complete the remaining signup steps.",
        variant: "destructive",
      })
    } catch (error) {
      const firstError = (
        error as {
          errors?: Array<{ longMessage?: string; message?: string }>
        }
      )?.errors?.[0]

      toast({
        title: "Verification failed",
        description:
          firstError?.longMessage ??
          firstError?.message ??
          "The code is invalid or has expired.",
        variant: "destructive",
      })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg bg-card border border-border p-10 space-y-6 shadow-lg">
        <div className="space-y-3 text-center">
          <p className="uppercase tracking-[0.25em] text-xs text-muted-foreground">Final Step</p>
          <h1 className="text-3xl font-serif font-light">Verify your email</h1>
          <p className="text-muted-foreground">
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-primary">{email || "your email"}</span>
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              Check your inbox and spam folder for your verification code.
            </p>
            <p className="text-xs text-muted-foreground mt-2">Codes expire quickly for security.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Verification Code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-widest font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length === 6) {
                  handleVerifyCode()
                }
              }}
            />
          </div>

          <Button
            onClick={handleVerifyCode}
            disabled={verifying || code.length !== 6}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-6 font-light tracking-wide disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Verify Code"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <div className="text-center">
            <button
              onClick={handleResendCode}
              disabled={sending || countdown > 0}
              className="text-sm text-primary underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
            >
              {sending
                ? "Sending..."
                : countdown > 0
                  ? `Resend in ${countdown}s`
                  : "Send a new code"}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-center text-sm text-muted-foreground">
            Wrong email?{" "}
            <Link href="/auth/signup" className="text-primary underline underline-offset-4 hover:opacity-80">
              Try again
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
