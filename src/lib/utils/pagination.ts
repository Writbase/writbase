export function parsePagination(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
  page: number;
} {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;
  return { limit, offset, page };
}
