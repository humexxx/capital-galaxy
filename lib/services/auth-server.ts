import { createClient } from "@/lib/supabase-server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";

// Server-side auth utilities
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserRole(userId: string): Promise<"admin" | "user" | null> {
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  
  return dbUser?.role || null;
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  const role = await getUserRole(user.id);
  
  if (role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
  
  return user;
}
