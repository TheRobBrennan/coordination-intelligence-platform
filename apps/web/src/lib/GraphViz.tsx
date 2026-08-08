// Dependency-free radial graph — topics on an inner ring, orgs on an outer
// ring, edges drawn between them. Pure SVG, no client JS, so it renders
// straight out of a Server Component. Deliberately simple (no physics sim,
// no drag/zoom) — this is a "see the shape of the data" view, not a
// full graph explorer.

type Edge = { org: string; topic: string; confidence: number };
type OrgNode = { name: string; sector: string };

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#a855f7", "#84cc16", "#f43f5e",
];

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// A label short enough to fit inside a small circle: prefer a parenthetical
// acronym if the name already has one ("... (AFPM)" -> "AFPM"), otherwise
// initials of the significant words.
function shortLabel(name: string, maxLetters = 3): string {
  const paren = name.match(/\(([A-Z0-9]{2,6})\)/);
  if (paren) return paren[1];
  const words = name
    .replace(/[()]/g, "")
    .split(/[\s/-]+/)
    .filter((w) => w.length > 2 && !/^(of|the|and|for)$/i.test(w));
  const initials = words
    .slice(0, maxLetters)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return initials || name.slice(0, maxLetters).toUpperCase();
}

function LabeledNode({
  x,
  y,
  r,
  fill,
  label,
  title,
  fontSize,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  label: string;
  title: string;
  fontSize: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke="white" strokeWidth={1} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={600}
        fill="black"
        stroke="white"
        strokeWidth={2.5}
        paintOrder="stroke"
      >
        {label}
      </text>
      <title>{title}</title>
    </g>
  );
}

export default function GraphViz({
  topics,
  orgs,
  edges,
  height = 460,
}: {
  topics: string[];
  orgs: OrgNode[];
  edges: Edge[];
  height?: number;
}) {
  const width = 640;
  const cx = width / 2;
  const cy = height / 2;
  const topicR = Math.min(width, height) * 0.2;
  const orgR = Math.min(width, height) * 0.44;

  const pos = (count: number, index: number, radius: number) => {
    const angle = (index / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };

  const topicPos = new Map(topics.map((t, i) => [t, pos(topics.length, i, topicR)]));
  const orgPos = new Map(orgs.map((o, i) => [o.name, pos(orgs.length, i, orgR)]));

  if (topics.length === 0 || orgs.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
        Nothing to draw yet — the graph is empty.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
      <g strokeLinecap="round">
        {edges.map((e, i) => {
          const a = orgPos.get(e.org);
          const b = topicPos.get(e.topic);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeOpacity={0.12 + e.confidence * 0.35}
              strokeWidth={1}
              className="text-zinc-400 dark:text-zinc-600"
            />
          );
        })}
      </g>
      {orgs.map((o) => {
        const p = orgPos.get(o.name);
        if (!p) return null;
        return (
          <LabeledNode
            key={o.name}
            x={p.x}
            y={p.y}
            r={11}
            fill={colorFor(o.sector)}
            label={shortLabel(o.name, 2)}
            title={`${o.name} — ${o.sector}`}
            fontSize={8}
          />
        );
      })}
      {topics.map((t) => {
        const p = topicPos.get(t);
        if (!p) return null;
        return (
          <LabeledNode
            key={t}
            x={p.x}
            y={p.y}
            r={20}
            fill={colorFor(t)}
            label={shortLabel(t, 3)}
            title={t}
            fontSize={10}
          />
        );
      })}
    </svg>
  );
}
