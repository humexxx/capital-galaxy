export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface ApiRequest {
  data: unknown
  userId?: string
}
