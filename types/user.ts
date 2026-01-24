export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  createdAt: Date
  updatedAt: Date
}

export interface AuthUser {
  name: string
}

export type UserListItem = {
  id: string;
  email: string | null;
  fullName: string | null;
};

import { z } from "zod"
import { userFormSchema } from "@/schemas/user"

export type UserFormData = z.infer<typeof userFormSchema>
