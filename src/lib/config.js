const config = {
  appName: "Influenci",
  tagline: "AI influencer video studio",
  theme: process.env.NEXT_PUBLIC_THEME || "slate-indigo",
  auth: {
    // Base URL used for Stripe success/cancel redirects.
    url: process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // price is in cents. 1 credit = $0.005.
    plans: {
      basic:    { id: "basic",    name: "Starter Pack",  credits: 1000,  price: 500  },
      standard: { id: "standard", name: "Creator Pack",  credits: 2000,  price: 1000 },
      pro:      { id: "pro",      name: "Pro Pack",      credits: 4000,  price: 2000 },
      business: { id: "business", name: "Agency Pack",   credits: 10000, price: 5000 },
    },
  },
};

export default config;
