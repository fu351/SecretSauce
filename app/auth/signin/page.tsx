"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/hooks"
import Image from "next/image"
import { ArrowRight, X } from "lucide-react"

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const { signIn } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await signIn(email, password)

      if (error) {
        toast({
          title: "Access Denied",
          description: error.message,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Welcome Back",
          description: "Access granted.",
        })
        router.push("/dashboard")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
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
        <button
          onClick={() => router.back()}
          className="absolute top-4 right-4 p-2 hover:bg-[#e8dcc4]/10 rounded-lg transition-colors"
          aria-label="Close sign in"
        >
          <X className="h-5 w-5 text-[#e8dcc4]/60 hover:text-[#e8dcc4]" />
        </button>
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <Image src="/logo-dark.png" alt="Secret Sauce" width={80} height={80} className="opacity-90" />
          </div>
          <h1 className="text-3xl font-serif font-light mb-2 tracking-tight">Welcome Back</h1>
          <p className="text-[#e8dcc4]/60 font-light">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email" className="text-[#e8dcc4]/80 font-light">
              Email
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
          <div>
            <Label htmlFor="password" className="text-[#e8dcc4]/80 font-light">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Sign In"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-[#e8dcc4]/60 font-light">
            Not a member yet?{" "}
            <Link href="/auth/signup" className="text-[#e8dcc4] hover:text-[#d4c8b0] font-normal">
              Request access
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
