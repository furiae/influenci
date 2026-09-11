import "./globals.css";
import { Providers } from "./providers";
import Navbar from "../components/Navbar";
import { Inter } from "next/font/google";
import config from "@/lib/config";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Influenci — AI Influencer Video Studio",
  description:
    "Create reusable AI actors and turn scripts into UGC-style influencer videos. Image-to-video, text-to-video and talking-actor clips from one studio.",
  keywords: ["AI influencer", "AI UGC", "AI actors", "AI video ads", "talking avatar", "image to video", "text to video"],
};

export default function RootLayout({ children }) {
  const theme = config.theme || "slate-indigo";
  return (
    <html lang="en" className="h-full w-full" data-theme={theme}>
      <body className={`${inter.className} h-full w-full flex flex-col antialiased bg-bg-page text-primary-text overflow-hidden`}>
        <Providers>
          <Navbar />
          <div className="flex-1 flex flex-col overflow-y-auto min-h-0">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
