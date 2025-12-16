export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  createdAt: Date
  updatedAt: Date
}

export interface AuthUser {
  id: string
  email: string
  name: string
}
