"use client";

import { useEffect } from "react";

// Server Action redirects back to this same route (no new URL to navigate
// to), so Next.js has nothing to trigger its usual scroll-to-top on — the
// viewport just stays wherever it was when the admin action's button was
// clicked. This forces it back to the top, animated, on every page mount.
export default function ScrollToTop() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return null;
}
