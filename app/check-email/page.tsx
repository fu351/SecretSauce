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
    <div className="min-h-screen bg-[#181813] text-[#e8dcc4] flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg bg-[#1f1e1a] border-[#e8dcc4]/20 p-10 space-y-6">
        <div className="space-y-3 text-center">
          <p className="uppercase tracking-[0.25em] text-xs text-[#e8dcc4]/60">Step</p>
          <h1 className="text-3xl font-serif font-light">Confirm your email.</h1>
          <p className="text-[#e8dcc4]/70">
            We sent a verification link to <span className="font-medium text-[#e8dcc4]">{user?.email ?? "your email"}</span>.
            Click the link to activate your account, then return here to sign in.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleResend}
            disabled={sending}
            className="w-full bg-[#e8dcc4] text-[#181813] hover:bg-[#d4c8b0] py-6 font-light tracking-wide disabled:opacity-50"
          >
            {sending ? "Sending..." : "Resend verification email"}
          </Button>
          <p className="text-center text-sm text-[#e8dcc4]/60">
            Ready to sign in?{" "}
            <Link href="/login" className="text-[#e8dcc4] underline underline-offset-4">
              Go to login
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
