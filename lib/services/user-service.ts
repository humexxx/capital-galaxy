import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { UserListItem } from "@/types";

export async function getAllUsers(): Promise<UserListItem[]> {
  return await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
    })
    .from(users)
    .orderBy(sql`${users.fullName} NULLS LAST, ${users.email}`);
}
