"use client"

import type React from "react"

import { useState, useRef, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Eye, EyeOff, Info, MapPin, ChevronDown } from "lucide-react"
import Link from "next/link"
import { countries } from "@/lib/countries"
import { setOnboarding } from "@/lib/onboarding-store"
import { useAllowedCountryCodes } from "@/hooks/use-allowed-country-codes"
import { filterCountriesByPolicy } from "@easner/shared"
import { CountryFlag } from "@/components/flags"
import { OtpCodeInput } from "@/components/otp-code-input"
import { useTeamInviteContext } from "@/lib/team-invite-storage"

const TERMS_URL = "https://www.easner.com/terms?from=register"

export default function SignupPage() {
  const [step, setStep] = useState<"signup" | "otp">("signup")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [otp, setOtp] = useState("")
  const [country, setCountry] = useState("")
  const [countryOpen, setCountryOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dropdownWidth, setDropdownWidth] = useState<number | undefined>(undefined)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { signup, verifySignupOtp, signInWithGoogle } = useAuth()
  const router = useRouter()
  const { isTeamInvite, invitePreview } = useTeamInviteContext()
  const countryPolicy = useAllowedCountryCodes("signup")
  const countriesForPicker = useMemo(
    () => filterCountriesByPolicy(countries, countryPolicy.unrestricted ? null : countryPolicy.codes),
    [countryPolicy.codes, countryPolicy.unrestricted],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    if (!country) {
      setError(countryRequiredError)
      return
    }
    try {
      setIsSubmitting(true)
      const precheck = (await fetch("/api/auth/signup-precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), surface: "business_web" }),
      })
        .then((r) => r.json())
        .catch(() => ({ ok: true }))) as { ok?: boolean; error?: string }
      if (precheck?.ok === false) {
        setError(precheck.error || "This email can't be used to sign up.")
        setIsSubmitting(false)
        return
      }
      setOnboarding({ countryCode: country, businessOnboardingComplete: false })
      const result = await signup(email, password, name)
      if (result.needsEmailConfirmation) {
        setStep("otp")
        setOtp("")
        setMessage("")
        return
      }
      router.push("/dashboard")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create account"
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")
    try {
      setIsSubmitting(true)
      await verifySignupOtp(email, otp)
      router.push("/dashboard")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired code.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setError("")
    setMessage("")
    if (!country) {
      setError(countryRequiredError)
      return
    }
    try {
      setOnboarding({ countryCode: country, businessOnboardingComplete: false })
      await signInWithGoogle()
    } catch {
      setError("Unable to continue with Google. Please try again.")
    }
  }

  const handleCountryOpenChange = (open: boolean) => {
    setCountryOpen(open)
    if (open && triggerRef.current) {
      setDropdownWidth(triggerRef.current.offsetWidth)
    }
  }

  const selectedCountry = countriesForPicker.find((c) => c.code === country)
  const countryFieldLabel = isTeamInvite ? "Country of residence" : "Country of registration"
  const countryPlaceholder = isTeamInvite
    ? "Select country of residence"
    : "Select country of registration"
  const countryRequiredError = isTeamInvite
    ? "Please select your country of residence."
    : "Please select your country of registration."

  return (
    <TooltipProvider>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            {step === "otp" ? "Verify your email" : isTeamInvite ? "Join your team" : "Open an account"}
          </CardTitle>
          {step === "otp" ? (
            <CardDescription>Enter the 6-digit code we sent to your email</CardDescription>
          ) : isTeamInvite && invitePreview ? (
            <CardDescription>
              Create an account to join {invitePreview.businessName} as {invitePreview.role}
            </CardDescription>
          ) : isTeamInvite ? (
            <CardDescription>Create an account to accept your team invitation</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={step === "signup" ? handleSubmit : handleVerifyOtp} className="space-y-4">
            {step === "signup" ? (
              <p className="text-sm text-muted-foreground text-center">
                By creating an account you agree to our{" "}
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium hover:underline"
                >
                  Terms
                </a>
                .
              </p>
            ) : null}

            {step === "signup" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="country" className="text-sm font-medium">{countryFieldLabel}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">
                        {isTeamInvite
                          ? "Select your country of residence for account setup."
                          : "Select the country where your business is incorporated or registered."}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Popover open={countryOpen} onOpenChange={handleCountryOpenChange}>
                  <PopoverTrigger asChild>
                    <Button
                      ref={triggerRef}
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryOpen}
                      className="w-full justify-between h-10"
                      type="button"
                    >
                      {selectedCountry ? (
                        <div className="flex items-center gap-2">
                          <CountryFlag code={selectedCountry.code} size={22} />
                          <span className="text-sm">{selectedCountry.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{countryPlaceholder}</span>
                        </div>
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="p-0" 
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    style={{ width: dropdownWidth ? `${dropdownWidth}px` : 'auto' }}
                  >
                    <Command>
                      <CommandInput placeholder="Search..." className="h-9 text-sm" />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty className="text-sm">
                          {countryPolicy.loading ? "Loading countries…" : "No country found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {countriesForPicker.map((country) => (
                            <CommandItem
                              key={country.code}
                              value={country.name}
                              onSelect={() => {
                                setCountry(country.code)
                                setCountryOpen(false)
                              }}
                              className="text-sm"
                            >
                              <div className="flex items-center gap-2 w-full">
                                <CountryFlag code={country.code} size={22} />
                                <span className="flex-1">{country.name}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            ) : null}

            {step === "signup" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignUp}
                  disabled={!country || isSubmitting}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign up with Google
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Full name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-10 text-sm"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 text-sm"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10 h-10 text-sm"
                      disabled={isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isSubmitting}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {message && <p className="text-sm text-primary">{message}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!name || !email || !password || !country || isSubmitting}
                >
                  {isSubmitting ? "Creating account…" : "Create account"}
                </Button>
              </>
            ) : (
              <>
                <OtpCodeInput
                  id="signup-otp"
                  value={otp}
                  onChange={setOtp}
                  autoFocus
                  disabled={isSubmitting}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  className="w-full mt-2"
                  disabled={otp.replace(/\D/g, "").length !== 6 || isSubmitting}
                >
                  {isSubmitting ? "Verifying…" : "Continue"}
                </Button>
              </>
            )}
          </form>

          <div className="mt-4 text-center text-sm">
            {"Already have an account? "}
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
