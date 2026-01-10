"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Mail } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) throw error

      setEmailSent(true)
      toast({
        title: "Check your email",
        description: "We've sent you a password reset link.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8dcc4] flex items-center justify-center py-12 px-6">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, #e8dcc4 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <Card className="w-full max-w-md bg-[#0a0a0a] border-[#e8dcc4]/20 p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <Image src="/logo-dark.png" alt="Secret Sauce" width={80} height={80} className="opacity-90" />
          </div>
          <h1 className="text-3xl font-serif font-light mb-2 tracking-tight">Reset Password</h1>
          <p className="text-[#e8dcc4]/60 font-light">
            {emailSent ? "Check your inbox" : "Enter your email to receive a reset link"}
          </p>
        </div>

        {!emailSent ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email" className="text-[#e8dcc4]/80 font-light flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-[#e8dcc4]/5 border border-[#e8dcc4]/20">
              <p className="text-sm text-[#e8dcc4]/80 text-center">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <p className="text-xs text-[#e8dcc4]/60 text-center mt-2">
                Click the link in the email to reset your password. The link expires in 1 hour.
              </p>
            </div>
            <Button
              onClick={() => {
                setEmailSent(false)
                setEmail("")
              }}
              variant="outline"
              className="w-full border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
            >
              Send Another Link
            </Button>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href="/auth/signin" className="text-sm text-[#e8dcc4]/60 hover:text-[#e8dcc4] font-light inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
        </div>
      </Card>
    </div>
  )
}
