"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSignIn } from "@clerk/nextjs"
import { useAuth as useAppAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/ui/use-toast"
import Image from "next/image"
import { ArrowRight, X } from "lucide-react"
import posthog from "posthog-js"
import { ensureProfileWithTimeout } from "@/lib/auth/ensure-profile-client"
import { isProfileOnboardingComplete } from "@/lib/auth/onboarding"

type MfaStrategy = "email_code" | "phone_code" | "totp" | "backup_code"

type SupportedSecondFactor = {
  strategy: MfaStrategy
  safeIdentifier?: string
  emailAddressId?: string
  phoneNumberId?: string
}

const STRATEGY_LABELS: Record<MfaStrategy, string> = {
  email_code: "Email code",
  phone_code: "SMS code",
  totp: "Authenticator app",
  backup_code: "Backup code",
}

function getClerkErrorMessage(error: unknown): string {
  return (
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.longMessage ??
    (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
      ?.message ??
    "An unexpected error occurred."
  )
}

function normalizeSecondFactors(raw: unknown): SupportedSecondFactor[] {
  const factors = Array.isArray(raw) ? raw : []

  return factors
    .map((factor) => {
      const strategy = (factor as { strategy?: string })?.strategy
      if (
        strategy !== "email_code" &&
        strategy !== "phone_code" &&
        strategy !== "totp" &&
        strategy !== "backup_code"
      ) {
        return null
      }

      return {
        strategy,
        safeIdentifier: (factor as { safeIdentifier?: string })?.safeIdentifier,
        emailAddressId: (factor as { emailAddressId?: string })?.emailAddressId,
        phoneNumberId: (factor as { phoneNumberId?: string })?.phoneNumberId,
      } satisfies SupportedSecondFactor
    })
    .filter((factor): factor is SupportedSecondFactor => Boolean(factor))
}

function pickPreferredFactor(factors: SupportedSecondFactor[]): SupportedSecondFactor | null {
  return (
    factors.find((factor) => factor.strategy === "email_code") ??
    factors.find((factor) => factor.strategy === "phone_code") ??
    factors.find((factor) => factor.strategy === "totp") ??
    factors.find((factor) => factor.strategy === "backup_code") ??
    null
  )
}

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const [secondFactorCode, setSecondFactorCode] = useState("")
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<MfaStrategy | null>(null)
  const [secondFactorTarget, setSecondFactorTarget] = useState("")
  const [availableSecondFactors, setAvailableSecondFactors] = useState<SupportedSecondFactor[]>([])

  const { isLoaded, signIn, setActive } = useSignIn()
  const { user, profile, loading: authLoading } = useAppAuth()
  const { toast } = useToast()
  const router = useRouter()

  const isMfaStep = Boolean(secondFactorStrategy)

  const activeFactor = useMemo(
    () => availableSecondFactors.find((factor) => factor.strategy === secondFactorStrategy) ?? null,
    [availableSecondFactors, secondFactorStrategy]
  )

  useEffect(() => {
    if (authLoading || !user || loading) return
    router.replace(isProfileOnboardingComplete(profile) ? "/dashboard" : "/onboarding")
  }, [authLoading, loading, profile, router, user])

  const completeSignIn = async (createdSessionId: string | null) => {
    if (!createdSessionId) {
      toast({
        title: "Sign-in Incomplete",
        description: "Missing session id from Clerk.",
        variant: "destructive",
      })
      return
    }

    await setActive({ session: createdSessionId })
    const payload = await ensureProfileWithTimeout()
    posthog.capture("user_signed_in", { method: "email" })
    toast({
      title: "Welcome Back",
      description: "Access granted.",
    })
    router.push(isProfileOnboardingComplete(payload?.profile) ? "/dashboard" : "/onboarding")
  }

  const startSecondFactor = async (factor: SupportedSecondFactor) => {
    if (!signIn) return

    setSecondFactorStrategy(factor.strategy)
    setSecondFactorTarget(factor.safeIdentifier ?? "")
    setSecondFactorCode("")

    if (factor.strategy === "email_code" || factor.strategy === "phone_code") {
      const params: {
        strategy: "email_code" | "phone_code"
        emailAddressId?: string
        phoneNumberId?: string
      } = {
        strategy: factor.strategy,
      }

      if (factor.strategy === "email_code" && factor.emailAddressId) {
        params.emailAddressId = factor.emailAddressId
      }

      if (factor.strategy === "phone_code" && factor.phoneNumberId) {
        params.phoneNumberId = factor.phoneNumberId
      }

      await signIn.prepareSecondFactor(params)

      toast({
        title: "Code sent",
        description: factor.safeIdentifier
          ? `We sent a code to ${factor.safeIdentifier}.`
          : "We sent your second-factor code.",
      })
      return
    }

    toast({
      title: STRATEGY_LABELS[factor.strategy],
      description:
        factor.strategy === "totp"
          ? "Enter the code from your authenticator app."
          : "Enter one of your backup codes.",
    })
  }

  const enterSecondFactorFlow = async (result: {
    supportedSecondFactors?: unknown
    status?: string | null
  }) => {
    const factors = normalizeSecondFactors(result.supportedSecondFactors)
    if (factors.length === 0) {
      toast({
        title: "Second Factor Required",
        description: "No available second factor found for this account.",
        variant: "destructive",
      })
      return
    }

    setAvailableSecondFactors(factors)

    const preferred = pickPreferredFactor(factors)
    if (!preferred) {
      toast({
        title: "Second Factor Required",
        description: "Could not determine which second factor to use.",
        variant: "destructive",
      })
      return
    }

    await startSecondFactor(preferred)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signIn) return

    setLoading(true)

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === "complete") {
        await completeSignIn(result.createdSessionId)
        return
      }

      if (result.status === "needs_second_factor") {
        await enterSecondFactorFlow(result)
        return
      }

      toast({
        title: "Sign-in Incomplete",
        description: "Please complete the remaining sign-in steps.",
        variant: "destructive",
      })
    } catch (error) {
      toast({
        title: "Access Denied",
        description: getClerkErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSecondFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !signIn || !secondFactorStrategy) return

    if (!secondFactorCode.trim()) {
      toast({
        title: "Missing code",
        description: "Enter your second-factor code to continue.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: secondFactorCode.trim(),
      })

      if (result.status === "complete") {
        await completeSignIn(result.createdSessionId)
        return
      }

      if (result.status === "needs_second_factor") {
        toast({
          title: "Verification failed",
          description: "That code was not accepted. Please try again.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Sign-in Incomplete",
        description: "Please complete the remaining sign-in steps.",
        variant: "destructive",
      })
    } catch (error) {
      toast({
        title: "Verification failed",
        description: getClerkErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!signIn || !activeFactor) return

    if (activeFactor.strategy !== "email_code" && activeFactor.strategy !== "phone_code") {
      toast({
        title: "No resend available",
        description: "This factor does not use a delivered code.",
      })
      return
    }

    setLoading(true)
    try {
      await startSecondFactor(activeFactor)
    } catch (error) {
      toast({
        title: "Unable to resend",
        description: getClerkErrorMessage(error),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const resetToPasswordStep = () => {
    setSecondFactorCode("")
    setSecondFactorTarget("")
    setSecondFactorStrategy(null)
    setAvailableSecondFactors([])
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
          <h1 className="text-3xl font-serif font-light mb-2 tracking-tight">
            {isMfaStep ? "Verify It's You" : "Welcome Back"}
          </h1>
          <p className="text-[#e8dcc4]/60 font-light">
            {isMfaStep
              ? "Complete your second factor to finish signing in"
              : "Enter your credentials to continue"}
          </p>
        </div>

        <form onSubmit={isMfaStep ? handleSecondFactorSubmit : handlePasswordSubmit} className="space-y-6">
          {!isMfaStep && (
            <>
              <div>
                <Label htmlFor="email" className="text-[#e8dcc4]/80 font-light">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
                />
              </div>
            </>
          )}

          {isMfaStep && (
            <>
              {availableSecondFactors.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-[#e8dcc4]/80 font-light">Method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableSecondFactors.map((factor) => (
                      <button
                        key={`${factor.strategy}-${factor.safeIdentifier ?? "default"}`}
                        type="button"
                        onClick={async () => {
                          setLoading(true)
                          try {
                            await startSecondFactor(factor)
                          } catch (error) {
                            toast({
                              title: "Unable to use method",
                              description: getClerkErrorMessage(error),
                              variant: "destructive",
                            })
                          } finally {
                            setLoading(false)
                          }
                        }}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          secondFactorStrategy === factor.strategy
                            ? "border-[#e8dcc4] bg-[#e8dcc4]/10"
                            : "border-[#e8dcc4]/20 hover:border-[#e8dcc4]/40"
                        }`}
                      >
                        {STRATEGY_LABELS[factor.strategy]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {secondFactorTarget && (
                <p className="text-xs text-[#e8dcc4]/60">
                  Code destination: <span className="text-[#e8dcc4]">{secondFactorTarget}</span>
                </p>
              )}

              <div>
                <Label htmlFor="second-factor-code" className="text-[#e8dcc4]/80 font-light">
                  {secondFactorStrategy === "backup_code" ? "Backup Code" : "Verification Code"}
                </Label>
                <Input
                  id="second-factor-code"
                  name="secondFactorCode"
                  type="text"
                  autoComplete="one-time-code"
                  value={secondFactorCode}
                  onChange={(e) => setSecondFactorCode(e.target.value)}
                  placeholder={secondFactorStrategy === "backup_code" ? "Enter backup code" : "Enter code"}
                  required
                  className="mt-2 bg-[#0a0a0a] border-[#e8dcc4]/20 text-[#e8dcc4] placeholder:text-[#e8dcc4]/30 focus:border-[#e8dcc4]/40"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={resetToPasswordStep}
                  className="text-[#e8dcc4]/60 hover:text-[#e8dcc4] underline"
                >
                  Start over
                </button>

                {(secondFactorStrategy === "email_code" || secondFactorStrategy === "phone_code") && (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-[#e8dcc4]/60 hover:text-[#e8dcc4] underline"
                    disabled={loading}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </>
          )}

          <Button
            type="submit"
            className="w-full bg-[#e8dcc4] text-[#0a0a0a] hover:bg-[#d4c8b0] py-6 font-light tracking-wide"
            disabled={loading}
          >
            {loading ? "Authenticating..." : isMfaStep ? "Verify & Sign In" : "Sign In"}
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
