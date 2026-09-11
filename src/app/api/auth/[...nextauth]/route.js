import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const CANONICAL_URL = process.env.NEXTAUTH_URL;
const handler = NextAuth(authOptions);

/**
 * NextAuth v4 builds every callback/redirect from NEXTAUTH_URL. That is the
 * custom domain in production, which breaks sign-in on the *.vercel.app
 * address (before DNS is live, or on preview deployments). When the request
 * arrives on a Vercel-issued host, use that host instead.
 */
function withRequestHost(fn) {
  return (req, ctx) => {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    if (host.endsWith(".vercel.app")) {
      process.env.NEXTAUTH_URL = `https://${host}`;
    } else if (CANONICAL_URL) {
      process.env.NEXTAUTH_URL = CANONICAL_URL;
    }
    return fn(req, ctx);
  };
}

export const GET = withRequestHost(handler);
export const POST = withRequestHost(handler);
