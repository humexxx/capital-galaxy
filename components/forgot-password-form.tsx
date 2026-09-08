"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Heading, Text } from "@/components/ui/typography"
import { AuthService } from "@/lib/services/auth-service"
import { forgotPasswordSchema, type ForgotPasswordData } from "@/schemas/auth"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordData): Promise<void> => {
    setError(null)
    setSuccess(false)

    try {
      await AuthService.resetPasswordForEmail(data.email)
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error sending reset email")
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
          <Heading level="h3" as="h1">Reset Password</Heading>
          <Text variant="muted" className="text-balance">
            Enter your email to receive a password reset link
          </Text>
        </div>
        
        {error && (
          <div
            className="text-destructive text-sm text-center p-2 bg-destructive/10 rounded"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        {success && (
          <div className="rounded border border-success/30 bg-success/10 p-2 text-center text-sm text-success" aria-live="polite">
            Check your email for the password reset link.
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" placeholder="m@example.com" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </Field>

        <Field>
          <Button type="submit" disabled={isSubmitting || success} className="w-full">
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </Button>
        </Field>

        <div className="text-center text-sm">
          Remember your password?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Login
          </Link>
        </div>
      </FieldGroup>
    </form>
  )
}
