import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Pages that need a signed-in user are redirected to /login. API routes check
// auth() themselves and answer 401, so they are left alone here.
const isProtectedPage = createRouteMatcher(["/", "/actors(.*)", "/gallery(.*)", "/calendar(.*)", "/settings(.*)"]);

export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedPage(request)) {
      await auth.protect();
    }
  },
  { signInUrl: "/login", signUpUrl: "/signup" }
);

export const config = {
  // Skip static files, Next internals and Workflow DevKit's internal endpoints.
  matcher: ["/((?!.*\\..*|_next|\\.well-known/workflow/).*)", "/", "/(api|trpc)(.*)"],
};
