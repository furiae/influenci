import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { registerTools } from "@/lib/mcp/tools";
import { registerPrompts, registerResources } from "@/lib/mcp/prompts";

export const maxDuration = 300;

/**
 * Remote MCP server for Claude.ai / Claude Code. OAuth is Clerk's: the
 * connector signs in with the user's Influenci account and every tool is
 * scoped to that user's brands and actors.
 */
const handler = createMcpHandler(
  (server) => {
    registerTools(server);
    registerPrompts(server);
    registerResources(server);
  },
  { serverInfo: { name: "influenci", version: "1.0.0" } }
);

async function verify(_req, token) {
  if (!token) return undefined;
  const clerkAuth = await auth({ acceptsToken: "oauth_token" });
  const info = verifyClerkToken(clerkAuth, token);
  if (!info) return undefined;
  return { ...info, extra: { ...(info.extra || {}), userId: clerkAuth.userId || info.extra?.userId } };
}

const authed = withMcpAuth(handler, verify, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" });

export { authed as GET, authed as POST, authed as DELETE };
