"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSignIn } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/ui/use-toast"
import { ArrowLeft, Mail } from "lucide-react"

function getClerkErrorMessage(error: unknown): string {
  return (
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.longMessage ??
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.message ??
    (error as { message?: string })?.message ??
    "An unexpected error occurred."
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [passwordReset, setPasswordReset] = useState(false)
  const { isLoaded, signIn, setActive } = useSignIn()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signIn) return

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
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      })

      setEmailSent(true)
      toast({
        title: "Check your email",
        description: "We've sent you a password reset code.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: getClerkErrorMessage(error) || "Failed to send reset email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signIn) return

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      })

      if (result.status === "complete") {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId })
        }
        setPasswordReset(true)
        toast({
          title: "Password updated",
          description: "Your password has been reset successfully.",
        })
        return
      }

      toast({
        title: "Reset incomplete",
        description: "Please check the code and try again.",
        variant: "destructive",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: getClerkErrorMessage(error) || "Failed to reset password. Please try again.",
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
            {passwordReset
              ? "Your password has been updated"
              : emailSent
                ? "Enter the code from your inbox"
                : "Enter your email to receive a reset code"}
          </p>
        </div>

        {passwordReset ? (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-[#e8dcc4]/5 border border-[#e8dcc4]/20">
              <p className="text-sm text-[#e8dcc4]/80 text-center">
                Your password has been reset. You can continue to your account.
              </p>
            </div>
            <Link href="/dashboard">
              <Button className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide">
                Continue
              </Button>
            </Link>
          </div>
        ) : !emailSent ? (
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
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="p-4 rounded-lg bg-[#e8dcc4]/5 border border-[#e8dcc4]/20">
              <p className="text-sm text-[#e8dcc4]/80 text-center">
                We've sent a password reset code to <strong>{email}</strong>
              </p>
              <p className="text-xs text-[#e8dcc4]/60 text-center mt-2">
                Enter the code below and choose a new password.
              </p>
            </div>
            <div>
              <Label htmlFor="code" className="text-[#e8dcc4]/80 font-light">
                Reset Code
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
              />
            </div>
            <div>
              <Label htmlFor="new-password" className="text-[#e8dcc4]/80 font-light">
                New Password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password" className="text-[#e8dcc4]/80 font-light">
                Confirm Password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
              disabled={loading}
            >
              {loading ? "Updating..." : "Reset Password"}
            </Button>
            <Button
              onClick={() => {
                setEmailSent(false)
                setEmail("")
                setCode("")
                setPassword("")
                setConfirmPassword("")
              }}
              type="button"
              variant="outline"
              className="w-full border-[#e8dcc4]/30 text-[#e8dcc4] hover:bg-[#e8dcc4]/10"
            >
              Send Another Code
            </Button>
          </form>
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
