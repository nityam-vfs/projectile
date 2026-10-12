export function requireWriteAccess(request: Request) {
  const secret = process.env.APP_WRITE_TOKEN;
  if (!secret) throw new Error("APP_WRITE_TOKEN is not configured; write access is disabled.");
  if (request.headers.get("authorization") !== `Bearer ${secret}`) throw new Error("Unauthorized");
}
export function databaseUnavailable() { return Response.json({ error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable persistence." }, { status: 503 }); }
