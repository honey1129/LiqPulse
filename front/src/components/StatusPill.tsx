import type { ReactNode } from "react";
import { Circle } from "lucide-react";

type StatusPillProps = {
  label: string;
  tone?: "green" | "blue" | "amber" | "red" | "muted";
  icon?: ReactNode;
};

const toneClass = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
  blue: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300",
  amber: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
  red: "border-red-300 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300",
  muted: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
};

export function StatusPill({ label, tone = "muted", icon }: StatusPillProps) {
  return (
    <span className={`inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold ${toneClass[tone]}`}>
      {icon ?? <Circle className="h-2 w-2 fill-current" />}
      {label}
    </span>
  );
}
