"use client";

// Dependency-free bipartite graph — topics in a left column, orgs in a right
// column, edges drawn between them as curves. No physics sim, no drag/zoom —
// a "see the shape of the data" view, not a full graph explorer. Interactive:
// click a pill to highlight every edge touching it, or click an edge itself
// to highlight just that one connection.

import { useState } from "react";

type Edge = { org: string; topic: string; confidence: number };
type OrgNode = { name: string; sector: string };

const TOPIC_COLOR = "#111827"; // near-black — topics
const ORG_COLOR = "#2563eb"; // blue — organizations
const HIGHLIGHT_COLOR = "#f97316"; // orange — active selection

const ROW_HEIGHT = 30;
const PAD_Y = 24;
const COL_WIDTH = 260;
const GUTTER = 120;

// Selection is either a node ("node:<name>") or a single edge
// ("edge:<org>::<topic>") — null means nothing selected.
type Selection = string | null;

function Pill({
  x,
  y,
  width,
  color,
  label,
  align,
  dimmed,
  onClick,
}: {
  x: number;
  y: number;
  width: number;
  color: string;
  label: string;
  align: "left" | "right";
  dimmed: boolean;
  onClick: () => void;
}) {
  const boxX = align === "left" ? x : x - width;
  return (
    <g onClick={onClick} className="cursor-pointer" opacity={dimmed ? 0.3 : 1}>
      <rect x={boxX} y={y - 11} width={width} height={22} rx={11} fill={color} />
      <text
        x={x + (align === "left" ? 10 : -10)}
        y={y}
        textAnchor={align === "left" ? "start" : "end"}
        dominantBaseline="central"
        fontSize={10}
        fill="white"
      >
        {label}
      </text>
    </g>
  );
}

export default function GraphViz({
  topics,
  orgs,
  edges,
}: {
  topics: string[];
  orgs: OrgNode[];
  edges: Edge[];
}) {
  const [selected, setSelected] = useState<Selection>(null);

  if (topics.length === 0 || orgs.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
        Nothing to draw yet — the graph is empty.
      </div>
    );
  }

  const rows = Math.max(topics.length, orgs.length);
  const height = rows * ROW_HEIGHT + PAD_Y * 2;
  const width = COL_WIDTH * 2 + GUTTER;
  const leftX = 0;
  const rightX = width;

  const yFor = (index: number, count: number) => {
    const blockHeight = count * ROW_HEIGHT;
    const offset = (rows * ROW_HEIGHT - blockHeight) / 2;
    return PAD_Y + offset + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  };

  const topicPos = new Map(topics.map((t, i) => [t, yFor(i, topics.length)]));
  const orgPos = new Map(orgs.map((o, i) => [o.name, yFor(i, orgs.length)]));

  const pillWidth = (label: string) => Math.min(COL_WIDTH, Math.max(60, label.length * 5.6 + 24));

  const edgeId = (e: Edge) => `edge:${e.org}::${e.topic}`;
  const toggle = (id: string) => setSelected((cur) => (cur === id ? null : id));

  const edgeIsActive = (e: Edge) =>
    selected === edgeId(e) || selected === `node:${e.org}` || selected === `node:${e.topic}`;

  const anySelected = selected !== null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOPIC_COLOR }}
            />
            Topic
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ORG_COLOR }}
            />
            Organization
          </span>
        </div>
        {anySelected && (
          <button
            onClick={() => setSelected(null)}
            className="underline hover:opacity-70"
          >
            Clear selection
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <g strokeLinecap="round" fill="none">
          {edges.map((e, i) => {
            const y1 = orgPos.get(e.org);
            const y2 = topicPos.get(e.topic);
            if (y1 === undefined || y2 === undefined) return null;
            const midX = width / 2;
            const x1 = leftX + pillWidth(e.topic);
            const x2 = rightX - pillWidth(e.org);
            const active = edgeIsActive(e);
            const d = `M ${x1} ${y2} C ${midX} ${y2}, ${midX} ${y1}, ${x2} ${y1}`;
            return (
              <g key={i} onClick={() => toggle(edgeId(e))} className="cursor-pointer">
                {/* Invisible fat hit-area — the visible line below is only
                    1-2px, too thin to reliably click on its own. */}
                <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
                <path
                  d={d}
                  stroke={active ? HIGHLIGHT_COLOR : "currentColor"}
                  strokeOpacity={active ? 0.9 : anySelected ? 0.04 : 0.1 + e.confidence * 0.3}
                  strokeWidth={active ? 2 : 1}
                  fill="none"
                  className={active ? "" : "text-zinc-400 dark:text-zinc-600"}
                />
              </g>
            );
          })}
        </g>
        {topics.map((t) => {
          const y = topicPos.get(t);
          if (y === undefined) return null;
          const active = selected === `node:${t}`;
          const dimmed = anySelected && !active && !edges.some((e) => e.topic === t && edgeIsActive(e));
          return (
            <Pill
              key={t}
              x={leftX}
              y={y}
              width={pillWidth(t)}
              color={active ? HIGHLIGHT_COLOR : TOPIC_COLOR}
              label={t}
              align="left"
              dimmed={dimmed}
              onClick={() => toggle(`node:${t}`)}
            />
          );
        })}
        {orgs.map((o) => {
          const y = orgPos.get(o.name);
          if (y === undefined) return null;
          const active = selected === `node:${o.name}`;
          const dimmed =
            anySelected && !active && !edges.some((e) => e.org === o.name && edgeIsActive(e));
          return (
            <Pill
              key={o.name}
              x={rightX}
              y={y}
              width={pillWidth(o.name)}
              color={active ? HIGHLIGHT_COLOR : ORG_COLOR}
              label={o.name}
              align="right"
              dimmed={dimmed}
              onClick={() => toggle(`node:${o.name}`)}
            />
          );
        })}
      </svg>
    </div>
  );
}
