"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Heading, Text } from "@/components/ui/typography"
import { AuthService } from "@/lib/services/auth-service"
import { loginSchema, type LoginData } from "@/schemas/auth"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

// Only honour same-origin paths so a crafted ?next=https://evil.example doesn't
// turn the form into an open redirect. Anything that doesn't start with a
// single "/" falls back to the default landing page.
function safeNext(raw: string | null): string {
  if (!raw) return "/portal"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/portal"
  return raw
}

export function LoginForm({
  className,
  /** Hides the sign-up link while the app isn't taking new accounts. The real
   *  gate is server-side (see lib/auth/signups.ts); this just avoids offering
   *  a door that's shut. */
  signupsOpen = true,
  ...props
}: React.ComponentProps<"form"> & { signupsOpen?: boolean }) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  // OAuth failures come back as ?error= from /auth/callback — surface them.
  const [error, setError] = useState<string | null>(searchParams.get("error"))
  // Sign-up hands off here with ?message= ("check your email"); it was written
  // but never read, so a new account landed on a bare login form.
  const message = searchParams.get("message")
  const next = safeNext(searchParams.get("next"))
  const signupHref =
    next === "/portal" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginData): Promise<void> => {
    setError(null)

    try {
      await AuthService.loginWithPassword(data.email, data.password)
      router.push(next)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error initializing login")
    }
  }

  const isLoading = isSubmitting || isGoogleLoading

  async function handleGoogleLogin() {
    setIsGoogleLoading(true)
    try {
      await AuthService.signInWithGoogle(next === "/portal" ? null : next)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error with Google login")
      setIsGoogleLoading(false)
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <Heading level="h3" as="h1">Login to your account</Heading>
          <Text variant="muted" className="text-balance">
            Enter your email below to login
          </Text>
        </div>
        
        {message && !error && (
          <div
            className="text-muted-foreground text-sm text-center p-2 bg-muted rounded"
            role="alert"
            aria-live="polite"
          >
            {message}
          </div>
        )}
        {error && (
          <div
            className="text-destructive text-sm text-center p-2 bg-destructive/10 rounded"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" placeholder="m@example.com" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </Field>
        <Field>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isSubmitting ? "Logging in..." : "Login"}
          </Button>
        </Field>
        <FieldSeparator>Or continue with</FieldSeparator>
        <Field>
          <Button variant="outline" type="button" onClick={handleGoogleLogin} className="w-full" disabled={isLoading}>
            <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true" fill="currentColor">
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
            Google
          </Button>
        </Field>

        {signupsOpen && (
          <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href={signupHref} className="underline underline-offset-4">
              Sign up
            </Link>
          </div>
        )}
      </FieldGroup>
    </form>
  )
}
