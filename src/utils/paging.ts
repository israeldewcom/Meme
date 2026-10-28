export function parsePaging(query: Record<string, unknown>, defLimit = 24, maxLimit = 60) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defLimit));
  return { page, limit };
}
