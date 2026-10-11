import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["msedge-tts", "pg", "@resvg/resvg-js"],
  // The card compositor reads its font files at runtime.
  outputFileTracingIncludes: { "/api/**": ["./src/lib/render/templates/fonts/*"], "/.well-known/workflow/**": ["./src/lib/render/templates/fonts/*"] },
};

export default withWorkflow(nextConfig);
