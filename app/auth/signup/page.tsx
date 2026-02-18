"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSignUp } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks"
import Image from "next/image"
import { ArrowRight } from "lucide-react"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const { isLoaded, signUp, setActive } = useSignUp()
  const { toast } = useToast()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signUp) return

    // Validate password match
    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords don't match.",
        variant: "destructive",
      })
      return
    }

    // Validate password strength
    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
      })

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
        await fetch("/api/auth/ensure-profile", { method: "POST" })
        toast({
          title: "Account created!",
          description: "Let's set up your preferences.",
        })
        router.push("/onboarding")
        return
      }

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      })

      toast({
        title: "Check your email",
        description: "Enter the verification code we sent to finish creating your account.",
      })
      router.push(`/auth/check-email?email=${encodeURIComponent(email)}`)
    } catch (error) {
      const firstError = (
        error as {
          errors?: Array<{ code?: string; longMessage?: string; message?: string }>
        }
      )?.errors?.[0]

      if (firstError?.code === "form_identifier_exists") {
        toast({
          title: "Account Already Exists",
          description: "An account with this email already exists. Please sign in instead.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Signup Failed",
        description:
          firstError?.longMessage ??
          firstError?.message ??
          "An unexpected error occurred. Please try again.",
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
          <h1 className="text-3xl font-serif font-light mb-2 tracking-tight">Request Membership</h1>
          <p className="text-[#e8dcc4]/60 font-light">Begin your culinary journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email" className="text-[#e8dcc4]/80 font-light">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-[#e8dcc4]/80 font-light">
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
            />
            <p className="text-xs text-[#e8dcc4]/40 mt-1">At least 6 characters</p>
          </div>
          <div>
            <Label htmlFor="confirm-password" className="text-[#e8dcc4]/80 font-light">
              Confirm Password
            </Label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
            disabled={loading}
          >
            {loading ? "Processing..." : "Request Access"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-[#e8dcc4]/60 font-light">
            Already a member?{" "}
            <Link href="/auth/signin" className="text-[#e8dcc4] hover:text-[#d4c8b0] font-normal">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
