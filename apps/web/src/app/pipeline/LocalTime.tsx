"use client";

import { useEffect, useState } from "react";

// Server Components format dates using the server's (container's) timezone,
// which defaults to UTC — not the viewer's. A plain client component still
// renders once during SSR (in the server's timezone) before hydrating, which
// mismatches the client's re-render and trips a hydration error. Rendering
// nothing until after mount sidesteps that: the server and first client pass
// both render blank, and the real local time appears once mounted.
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);

  return <>{text ?? "…"}</>;
}
