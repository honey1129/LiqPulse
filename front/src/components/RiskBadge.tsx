import type { RiskLevel } from "../types";

type RiskBadgeProps = {
  risk: RiskLevel;
};

const riskStyles: Record<RiskLevel, string> = {
  Liquidatable: "border-red-300 bg-red-50 text-red-700 dark:border-red-400/40 dark:bg-red-500/[0.12] dark:text-red-300 dark:shadow-danger",
  "High Risk": "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/[0.12] dark:text-orange-300",
  Warning: "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-300/[0.35] dark:bg-yellow-400/10 dark:text-yellow-300",
  Healthy: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/[0.35] dark:bg-emerald-400/10 dark:text-emerald-300",
  "No Debt": "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300",
  Invalid: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300",
};

export function RiskBadge({ risk }: RiskBadgeProps) {
  return (
    <span className={`inline-flex h-6 min-w-[84px] items-center justify-center rounded border px-2 font-mono text-[10px] font-bold ${riskStyles[risk]}`}>
      {risk}
    </span>
  );
}
