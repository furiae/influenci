/** Public base URL of this deployment, for provider webhooks. */
export function publicBaseUrl() {
  if (process.env.WEBHOOK_URL) return process.env.WEBHOOK_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function muapiWebhookUrl() {
  const secret = process.env.MUAPI_WEBHOOK_SECRET;
  const base = `${publicBaseUrl()}/api/webhook/muapi`;
  return secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;
}
