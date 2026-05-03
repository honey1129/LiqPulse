import { Copy, DatabaseZap, Wifi } from "lucide-react";
import type { SourceStatus, Threshold } from "../types";
import { programId } from "../data/mockData";
import { Panel } from "./Panel";

type SummaryPanelsProps = {
  sourceStatus: SourceStatus[];
  thresholds: Threshold[];
  copiedProgram: boolean;
  onCopyProgram: () => void;
};

const thresholdDot = {
  red: "bg-red-400",
  amber: "bg-orange-400",
  yellow: "bg-yellow-300",
  green: "bg-emerald-400",
  muted: "bg-slate-500",
};

export function SummaryPanels({ sourceStatus, thresholds, copiedProgram, onCopyProgram }: SummaryPanelsProps) {
  return (
    <div className="grid grid-cols-[1.08fr_1.18fr_1.15fr_1.18fr] gap-3">
      <Panel title="Data Source">
        <div className="space-y-2">
          {sourceStatus.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] font-medium text-slate-700 dark:text-slate-300">
                {item.kind === "success" ? <Wifi className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" /> : <DatabaseZap className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
                <span>{item.label}</span>
              </div>
              <span className={`max-w-[140px] truncate font-mono text-[11px] ${item.kind === "success" ? "text-emerald-600 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Protocol">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-blue-800 shadow-glow">
            <div className="h-7 w-7 rounded-sm bg-white/[0.85] [clip-path:polygon(20%_0,100%_28%,70%_100%,0_80%)]" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-950 dark:text-white">marginfi v2</div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">Program ID</div>
            <button
              type="button"
              onClick={onCopyProgram}
              className="mt-1 flex max-w-[250px] items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left font-mono text-[10px] text-slate-600 hover:border-sky-400/60 hover:text-sky-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-300 dark:hover:border-sky-400/40 dark:hover:text-sky-200"
            >
              <span className="truncate">{programId}</span>
              <Copy className="h-3 w-3 shrink-0 text-slate-500" />
            </button>
            {copiedProgram && <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-300">Copied Program ID</div>}
          </div>
        </div>
      </Panel>

      <Panel title="Real-time Calculation">
        <div className="font-mono text-[11px] leading-6 text-slate-700 dark:text-slate-300">
          <div className="text-slate-900 dark:text-slate-200">Health Factor (HF)</div>
          <div>= collateral value / debt value</div>
          <div className="mt-2 inline-flex rounded border border-sky-300 bg-sky-50 px-2 py-1 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
            HF = Collateral (USD) / Debt (USD)
          </div>
          <div className="mt-2 text-slate-600 dark:text-slate-400">If Debt = 0 -&gt; HF = INF (No Debt)</div>
        </div>
      </Panel>

      <Panel title="Risk Thresholds (HF)">
        <div className="space-y-1.5">
          {thresholds.map((item) => (
            <div key={item.label} className="grid grid-cols-[80px_1fr_88px] items-center gap-2 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${thresholdDot[item.tone]}`} />
                <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
              </div>
              <span className="text-slate-600 dark:text-slate-500">-&gt;</span>
              <span className={item.tone === "red" ? "text-red-700 dark:text-red-300" : item.tone === "amber" ? "text-orange-700 dark:text-orange-300" : item.tone === "yellow" ? "text-yellow-700 dark:text-yellow-300" : item.tone === "green" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-400"}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
