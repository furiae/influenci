"use client";

import { useEffect } from "react";
import config from "@/lib/config";

export function Providers({ children }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", config.theme || "slate-indigo");
  }, []);

  return children;
}
