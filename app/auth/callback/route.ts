import { createClient } from "@/lib/supabase-server"
import { NEW_ACCOUNT_WINDOW_MS, signupsAllowed } from "@/lib/auth/signups"
import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const origin = requestUrl.origin
  // Same rule the login form applies client-side: a path on this origin only.
  // `${origin}${next}` with `next=@evil.com` used to resolve to evil.com.
  const rawNext = requestUrl.searchParams.get("next")
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/portal"

  const loginWithError = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    )

  // The provider (or Supabase) reports failures via error params instead of a
  // code — surface them on the login page rather than bouncing silently.
  const providerError =
    requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error")
  if (providerError) {
    return loginWithError(providerError)
  }
  if (!code) {
    return loginWithError("Sign-in was cancelled or the link is invalid.")
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return loginWithError(error.message)
  }

  // OAuth is a signup path too: an unknown Google account gets created by the
  // exchange above, so hiding /signup alone would leave this door open. A user
  // whose account was minted seconds ago IS this login's new account — undo it
  // by ending the session and bouncing them. (Their auth row still exists;
  // Supabase's own "allow new users to sign up" toggle is what prevents that,
  // and should be off too.)
  if (!signupsAllowed() && data.user?.created_at) {
    const age = Date.now() - new Date(data.user.created_at).getTime()
    if (age >= 0 && age < NEW_ACCOUNT_WINDOW_MS) {
      await supabase.auth.signOut({ scope: "local" })
      return loginWithError("Allstars Galaxy isn't taking new accounts right now.")
    }
  }

  return NextResponse.redirect(new URL(next, origin))
}
