"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import Footer from "@/components/Footer";
import { FaCheck, FaInfoCircle } from "react-icons/fa";
import toast, { Toaster } from "react-hot-toast";
import config from "@/lib/config";

const DESCRIPTIONS = {
  basic: "About 30 short Wan 2.2 clips. Good for testing actors and hooks.",
  standard: "About 65 clips, or a mix of 480p and 720p renders.",
  pro: "About 130 clips. Batch-test scripts across several actors.",
  business: "About 330 clips for agency workflows and volume testing.",
};

const PLANS = Object.values(config.stripe.plans).map((p) => ({
  ...p,
  priceLabel: `$${(p.price / 100).toFixed(0)}`,
  description: DESCRIPTIONS[p.id],
  popular: p.id === "pro",
}));

export default function Pricing() {
  const { status } = useSession();
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleCheckout = async (planId) => {
    if (status !== "authenticated") return toast.error("Sign in first to buy credits.");
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout is not available yet.");
      window.location.assign(data.url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-bg-page text-primary-text">
      <Toaster position="top-right" />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8 flex flex-col gap-10 items-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
            <FaInfoCircle className="text-primary text-xs" />
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Credit packs</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Buy credits</h1>
          <p className="text-xs sm:text-sm text-secondary-text max-w-lg leading-relaxed">
            1 credit is half a cent. A 5-second Wan 2.2 clip costs 30 credits; a talking actor costs 6 credits per second of speech. Free community-GPU models cost nothing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-bg-card border rounded-lg p-6 flex flex-col justify-between gap-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
                plan.popular ? "border-primary shadow-xl shadow-primary/5 lg:scale-105" : "border-divider/50 shadow-md"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[9px] font-black uppercase px-3 py-1 rounded-full tracking-wider shadow">
                  Most popular
                </span>
              )}
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide">{plan.name}</h3>
                  <p className="text-2xl font-black tracking-tight">{plan.priceLabel}</p>
                </div>
                <div className="text-xs bg-bg-page/50 border border-divider/30 p-3 rounded text-center font-extrabold text-primary">
                  {plan.credits.toLocaleString()} credits
                </div>
                <p className="text-xs text-secondary-text leading-relaxed font-medium min-h-[3rem]">{plan.description}</p>
                <ul className="space-y-2 border-t border-divider/30 pt-4 text-xs font-semibold text-secondary-text">
                  <li className="flex items-center gap-2"><FaCheck className="text-primary text-[10px]" /> All models and actors</li>
                  <li className="flex items-center gap-2"><FaCheck className="text-primary text-[10px]" /> Downloads without watermark</li>
                  <li className="flex items-center gap-2"><FaCheck className="text-primary text-[10px]" /> No subscription</li>
                </ul>
              </div>
              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan !== null}
                className={`w-full py-3 rounded-full text-xs font-bold transition-all shadow-md cursor-pointer active:scale-[0.98] ${
                  plan.popular ? "bg-primary text-white hover:bg-primary-hover" : "bg-bg-page hover:bg-bg-card text-primary-text border border-divider"
                }`}
              >
                {loadingPlan === plan.id ? "Opening checkout…" : "Buy credits"}
              </button>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
