import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["msedge-tts", "pg"],
};

export default withWorkflow(nextConfig);
