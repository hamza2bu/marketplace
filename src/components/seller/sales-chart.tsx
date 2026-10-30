"use client";

import { useEffect, useRef, useState } from "react";

type Point = { day: string; amountMinor: number };

const HEIGHT = 200;
const PAD = { top: 20, right: 8, bottom: 24, left: 48 };
const MAX_BAR = 24;
const GAP = 2;

/** Rounds up to a clean axis maximum: 1, 2, 2.5, 5 × 10ⁿ. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((m) => m * exp >= value) ?? 10) * exp;
}

/**
 * Daily sales as columns (one series, so no legend: the heading names it).
 * Hover or focus a day for its value; the same numbers are in the table below.
 */
export function SalesChart({
  data,
  locale,
  label,
  tableLabel,
  dayLabel,
  amountLabel,
}: {
  data: Point[];
  locale: string;
  label: string;
  tableLabel: string;
  dayLabel: string;
  amountLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Null until measured in the browser: the chart renders client-side only, so
  // server and browser never format its numbers differently (hydration).
  const [width, setWidth] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", notation: "compact", maximumFractionDigits: 1 });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const toDate = (day: string) => new Date(`${day}T00:00:00Z`);

  if (width === null) {
    return (
      <figure className="space-y-2">
        <div ref={box} className="relative" dir="ltr">
          <div style={{ height: HEIGHT }} className="rounded-md bg-surface" aria-hidden />
        </div>
      </figure>
    );
  }

  const max = niceMax(Math.max(...data.map((d) => d.amountMinor / 100)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const y = (shekels: number) => PAD.top + plotH - (shekels / max) * plotH;
  const ticks = [0, max / 2, max];
  const peak = data.reduce((best, d, i) => (d.amountMinor > data[best].amountMinor ? i : best), 0);
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <figure className="space-y-2">
      <div ref={box} className="relative" dir="ltr">
        <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px]">
                {compact.format(tick)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const value = d.amountMinor / 100;
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const h = Math.max(0, y(0) - y(value));
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={d.day}>
                {h > 0 && (
                  // Rounded data end, square at the baseline.
                  <path
                    d={`M${x},${y(0)} V${y(value) + r} Q${x},${y(value)} ${x + r},${y(value)} H${x + barW - r} Q${x + barW},${y(value)} ${x + barW},${y(value) + r} V${y(0)} Z`}
                    fill="var(--chart-1)"
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px]">
                    {dayFmt.format(toDate(d.day))}
                  </text>
                )}
                {/* Hit target: the whole column, wider than the bar. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayFmt.format(toDate(d.day))}: ${money.format(value)}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
          {data[peak].amountMinor > 0 && active === null && (
            <text
              x={PAD.left + peak * slot + slot / 2}
              y={y(data[peak].amountMinor / 100) - 6}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-semibold"
            >
              {money.format(data[peak].amountMinor / 100)}
            </text>
          )}
        </svg>
        {active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-border bg-background px-2 py-1 text-xs whitespace-nowrap shadow-md"
            style={{ left: Math.min(width - 60, Math.max(60, PAD.left + active * slot + slot / 2)) }}
          >
            <span className="text-muted">{dayFmt.format(toDate(data[active].day))}</span>{" "}
            <span className="font-semibold">{money.format(data[active].amountMinor / 100)}</span>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{tableLabel}</summary>
        <table className="mt-2 w-full max-w-sm">
          <thead>
            <tr className="text-muted">
              <th className="p-1 text-start font-medium">{dayLabel}</th>
              <th className="p-1 text-end font-medium">{amountLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="p-1">{dayFmt.format(toDate(d.day))}</td>
                <td className="p-1 text-end tabular-nums">{money.format(d.amountMinor / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
