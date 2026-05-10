import { useEffect, useRef } from "react";
import type { Segment } from "@/types";
import { formatTimestamp } from "@/format";

interface Props {
  segments: Segment[];
  activeIndex: number | null;
  onSeek: (sec: number) => void;
}

export default function TranscriptView({ segments, activeIndex, onSeek }: Props) {
  const containerRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (activeIndex == null) return;
    const el = itemRefs.current[activeIndex];
    if (!el || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (e.top < c.top || e.bottom > c.bottom) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  if (segments.length === 0) {
    return (
      <div className="text-slate-600 italic p-4">No transcript yet.</div>
    );
  }

  return (
    <ol
      ref={containerRef}
      className="space-y-1 max-h-[60vh] overflow-y-auto pr-2"
    >
      {segments.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <li
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            data-active={isActive ? "true" : "false"}
            role="button"
            tabIndex={0}
            onClick={() => onSeek(s.start_sec)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSeek(s.start_sec);
              }
            }}
            className={`flex gap-3 px-3 py-1.5 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 ${
              isActive ? "bg-amber-100" : "hover:bg-slate-100"
            }`}
          >
            <span className="text-xs font-mono text-slate-500 w-12 shrink-0 pt-0.5">
              {formatTimestamp(s.start_sec)}
            </span>
            <span className="text-sm">{s.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
