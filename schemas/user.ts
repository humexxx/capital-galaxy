import { z } from "zod";

export const userRoleEnum = z.enum(["admin", "user"]);

export type UserRole = z.infer<typeof userRoleEnum>;

export const userFormSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  role: userRoleEnum.default("user"),
});

export type UserFormData = z.infer<typeof userFormSchema>;

