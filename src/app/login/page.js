"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaGoogle } from "react-icons/fa";
import { FiVideo, FiUsers, FiMic } from "react-icons/fi";
import config from "@/lib/config";

function LoginContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("callbackUrl") || searchParams.get("next") || "/";

  const [googleReady, setGoogleReady] = useState(null); // null = checking

  useEffect(() => {
    if (status === "authenticated") router.push(next);
  }, [status, router, next]);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => setGoogleReady(Boolean(p && p.google)))
      .catch(() => setGoogleReady(false));
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center bg-bg-page px-6 py-12 text-primary-text">
      <div className="relative bg-bg-card border border-divider w-full max-w-md rounded-xl p-8 space-y-6 shadow-2xl animate-scale-up">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-black shadow-md shadow-primary/30">
            {config.appName.charAt(0)}
          </div>
          <h1 className="text-2xl font-black tracking-tight">{config.appName}</h1>
          <p className="text-xs font-semibold text-secondary-text leading-relaxed px-2">{config.tagline}. Sign in to build actors and render videos.</p>
        </div>

        <ul className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-secondary-text">
          <li className="rounded-lg border border-divider/60 bg-bg-page/60 p-3 space-y-1"><FiUsers className="mx-auto text-primary" /> <span>Reusable AI actors</span></li>
          <li className="rounded-lg border border-divider/60 bg-bg-page/60 p-3 space-y-1"><FiVideo className="mx-auto text-primary" /> <span>Image → video ads</span></li>
          <li className="rounded-lg border border-divider/60 bg-bg-page/60 p-3 space-y-1"><FiMic className="mx-auto text-primary" /> <span>Talking scripts</span></li>
        </ul>

        {googleReady === false ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 leading-relaxed">
            <strong>Google sign-in isn&apos;t configured yet.</strong> Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the Vercel project and redeploy.
          </div>
        ) : (
          <button
            onClick={() => signIn("google", { callbackUrl: next })}
            disabled={googleReady === null}
            className="w-full py-3.5 bg-white text-neutral-900 border border-divider rounded-full text-sm font-bold flex items-center justify-center gap-3 hover:bg-neutral-50 transition-all shadow-md active:scale-[0.98] cursor-pointer disabled:opacity-60"
          >
            <FaGoogle className="text-red-500" />
            <span>Continue with Google</span>
          </button>
        )}

        <p className="text-[11px] text-center text-secondary-text leading-relaxed">
          New accounts start with {" "}
          <span className="font-bold text-primary-text">100 free credits</span>. Bring your own provider key later to render without credits.
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full flex items-center justify-center bg-bg-page">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
