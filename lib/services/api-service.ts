import type { ApiResponse } from "@/types/api"

export class ApiService {
  private static readonly BASE_URL = "/api"

  static async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `HTTP error! status: ${response.status}`)
    }

    const result: ApiResponse<T> = await response.json()
    
    if (result.error) {
      throw new Error(result.error)
    }

    return result.data as T
  }

  static async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${endpoint}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `HTTP error! status: ${response.status}`)
    }

    const result: ApiResponse<T> = await response.json()
    
    if (result.error) {
      throw new Error(result.error)
    }

    return result.data as T
  }

  static async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `HTTP error! status: ${response.status}`)
    }

    const result: ApiResponse<T> = await response.json()
    
    if (result.error) {
      throw new Error(result.error)
    }

    return result.data as T
  }

  static async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${endpoint}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `HTTP error! status: ${response.status}`)
    }

    const result: ApiResponse<T> = await response.json()
    
    if (result.error) {
      throw new Error(result.error)
    }

    return result.data as T
  }
}
