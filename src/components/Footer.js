"use client";

import config from "@/lib/config";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-divider/40 bg-bg-page py-6 text-center text-xs text-secondary-text mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        &copy; {year} {config.appName}. Built on the open-source Open AI UGC studio.
      </div>
    </footer>
  );
}
