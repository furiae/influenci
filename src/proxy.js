import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Pages that need a signed-in user are redirected to /login. API routes check
// auth() themselves and answer 401, so they are left alone here.
const isProtectedPage = createRouteMatcher(["/", "/actors(.*)", "/gallery(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedPage(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
