
import { createClient } from "@/lib/supabase"

export class AuthService {
  static async signInWithEmail(email: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    
    if (error) {
       throw error
    }
  }

  static async signInWithGoogle() {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      throw error
    }
  }
  
  // Note: The user requested "login with email", usually implies magic link or password.
  // The provided login form has a password field, so I should use signInWithPassword.
  
  static async loginWithPassword(email: string, password: string) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      throw error
    }
    
    return data
  }

  static async signUpWithEmail(email: string, password: string, name: string) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    })

    if (error) {
      throw error
    }
    
    return data
  }
  
  static async signOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
        throw error
    }
  }

  static async resetPasswordForEmail(email: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/portal/profile/update-password`,
    })
    
    if (error) {
      throw error
    }
  }
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

