import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Google is only offered when its credentials exist, so a misconfigured
  // deployment shows a clear notice on /login instead of an OAuthSignin error.
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      const userId = token.id || token.sub;
      if (userId) {
        token.id = userId;
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { credits: true, apiKeys: true },
          });
          if (dbUser) {
            token.credits = dbUser.credits;
            // Only expose *which* providers have a key, never the key.
            const keys = dbUser.apiKeys && typeof dbUser.apiKeys === "object" ? dbUser.apiKeys : {};
            token.hasKeys = Object.fromEntries(Object.entries(keys).filter(([, v]) => Boolean(v)).map(([k]) => [k, true]));
          }
        } catch (err) {
          console.error("[AUTH_JWT_REFRESH_ERROR]", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id || token.sub;
        session.user.credits = token.credits ?? 0;
        session.user.hasKeys = token.hasKeys || {};
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
};

export default authOptions;
