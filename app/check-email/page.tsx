"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

export default function CheckEmailPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [sending, setSending] = useState(false)

  const handleResend = async () => {
    if (!user?.email) {
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
        email: user.email,
      })
      if (error) throw error

      toast({
        title: "Verification sent",
        description: `We just sent another verification email to ${user.email}.`,
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

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg bg-card border border-border p-10 space-y-6 shadow-lg">
        <div className="space-y-3 text-center">
          <p className="uppercase tracking-[0.25em] text-xs text-muted-foreground">Final Step</p>
          <h1 className="text-3xl font-serif font-light">Verify your email.</h1>
          <p className="text-muted-foreground">
            We sent a verification link to <span className="font-medium text-primary">{user?.email ?? "your email"}</span>.
            Click the link to verify your email and get full access to Secret Sauce.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleResend}
            disabled={sending}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-6 font-light tracking-wide disabled:opacity-50"
          >
            {sending ? "Sending..." : "Resend verification email"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don't see the email?{" "}
            <button
              onClick={handleResend}
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              Try sending again
            </button>
          </p>
        </div>
      </Card>
    </div>
  )
}
