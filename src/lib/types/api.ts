export interface ApiError {
  error: {
    code: string;
    message: string;
    recovery?: string;
    fields?: Record<string, string>;
    current_version?: number;
    retry_after?: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor?: string;
}
