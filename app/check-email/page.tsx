"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Mail, KeyRound } from "lucide-react"

export default function CheckEmailPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState("")
  const [activeTab, setActiveTab] = useState<"link" | "code">("link")
  const [email, setEmail] = useState<string>("")

  // Get email from user or localStorage
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email)
    } else if (typeof window !== "undefined") {
      const storedEmail = localStorage.getItem("pending_verification_email")
      if (storedEmail) {
        setEmail(storedEmail)
      }
    }
  }, [user])

  const handleResendLink = async () => {
    if (!email) {
      toast({
        title: "Missing email",
        description: "We can't find your email address. Please sign in again.",
        variant: "destructive",
      })
      return
    }

    setSending(true)
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
        },
      })
      if (error) throw error

      toast({
        title: "Link sent",
        description: `We just sent a new verification link to ${email}.`,
      })
    } catch (error) {
      toast({
        title: "Unable to resend",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  const handleSendCode = async () => {
    if (!email) {
      toast({
        title: "Missing email",
        description: "We can't find your email address. Please sign in again.",
        variant: "destructive",
      })
      return
    }

    setSending(true)
    try {
      // Request OTP code
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: false,
        },
      })
      if (error) throw error

      toast({
        title: "Code sent",
        description: `We just sent a 6-digit code to ${email}.`,
      })
    } catch (error) {
      toast({
        title: "Unable to send code",
        description: "Please wait a moment and try again.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!email) {
      toast({
        title: "Missing email",
        description: "Please sign in again.",
        variant: "destructive",
      })
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
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: code,
        type: "email",
      })

      if (error) throw error

      if (data.session) {
        // Clear stored email after successful verification
        if (typeof window !== "undefined") {
          localStorage.removeItem("pending_verification_email")
        }

        toast({
          title: "Email verified!",
          description: "Redirecting you to your account...",
        })
        router.push("/welcome")
      }
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "The code is invalid or has expired. Please try again.",
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
            We sent verification options to{" "}
            <span className="font-medium text-primary">{email || "your email"}</span>
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "link" | "code")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Link
            </TabsTrigger>
            <TabsTrigger value="code" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 mt-6">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click the verification link in your email to complete signup. The link is valid for 1 hour.
              </p>
              <Button
                onClick={handleResendLink}
                disabled={sending}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-6 font-light tracking-wide disabled:opacity-50"
              >
                {sending ? "Sending..." : "Resend verification link"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="code" className="space-y-4 mt-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your email. Codes expire after 1 hour.
              </p>

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
              </Button>

              <div className="text-center">
                <button
                  onClick={handleSendCode}
                  disabled={sending}
                  className="text-sm text-primary underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send a new code"}
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

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
