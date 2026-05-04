import { Activity, Clock3, DatabaseZap, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AccountHistoryPoint, AccountHistoryState } from "../types";
import { formatHf, formatUsd } from "../lib/format";
import { RiskBadge } from "./RiskBadge";

type AccountHistoryModalProps = {
  history: AccountHistoryState;
  onClose: () => void;
};

const formatTime = (value: number) => {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
};

const chartData = (points: AccountHistoryPoint[]) =>
  points.map((point) => ({
    ...point,
    hfValue: point.hf,
    slotLabel: point.slot.toLocaleString("en-US"),
    timeLabel: formatTime(point.recordedAtMs),
  }));

export function AccountHistoryModal({ history, onClose }: AccountHistoryModalProps) {
  if (!history.account) return null;

  const latest = history.points.length > 0 ? history.points[history.points.length - 1] : undefined;
  const data = chartData(history.points);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-5xl rounded-md border border-slate-200 bg-white shadow-[0_24px_80px_rgba(2,8,23,0.32)] dark:border-sky-400/20 dark:bg-[#08131c]">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-sky-400/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <DatabaseZap className="h-3.5 w-3.5" />
              Account History
            </div>
            <div className="mt-1 truncate font-mono text-[12px] text-slate-900 dark:text-slate-100">
              {history.account.accountFull ?? history.account.account}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-sky-400 hover:text-sky-700 dark:border-sky-400/20 dark:text-slate-300 dark:hover:bg-sky-400/10 dark:hover:text-white"
            aria-label="Close account history"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
          <div className="min-h-[340px] rounded-md border border-slate-200 bg-slate-50/80 p-3 dark:border-sky-400/12 dark:bg-black/20">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                <Activity className="h-4 w-4 text-sky-500" />
                Health Factor
              </div>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {history.points.length.toLocaleString("en-US")} points
              </span>
            </div>

            {history.status === "loading" && (
              <div className="flex h-[285px] items-center justify-center font-mono text-[12px] text-slate-500 dark:text-slate-400">
                Loading history...
              </div>
            )}

            {history.status === "error" && (
              <div className="flex h-[285px] items-center justify-center px-6 text-center font-mono text-[12px] text-red-600 dark:text-red-300">
                {history.error ?? "History lookup failed."}
              </div>
            )}

            {history.status === "ready" && history.points.length === 0 && (
              <div className="flex h-[285px] items-center justify-center font-mono text-[12px] text-slate-500 dark:text-slate-400">
                No history points recorded yet.
              </div>
            )}

            {history.status === "ready" && history.points.length > 0 && (
              <div className="h-[285px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ left: 4, right: 14, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis dataKey="slotLabel" tick={{ fontSize: 10 }} minTickGap={32} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#64748b" domain={["auto", "auto"]} />
                    <Tooltip
                      formatter={(value) => [typeof value === "number" ? value.toFixed(4) : value, "HF"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.timeLabel ?? ""}
                      contentStyle={{
                        borderRadius: 6,
                        border: "1px solid rgba(56,189,248,0.28)",
                        background: "rgba(8,19,28,0.94)",
                        color: "#e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="hfValue" stroke="#38bdf8" strokeWidth={2.4} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 dark:border-sky-400/12 dark:bg-black/20">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Latest Point
              </div>
              {latest ? (
                <div className="space-y-2 font-mono text-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">HF</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatHf(latest.hf)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Risk</span>
                    <RiskBadge risk={latest.risk} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Collateral</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatUsd(latest.collateralUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Debt</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatUsd(latest.debtUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Slot</span>
                    <span className="text-slate-900 dark:text-slate-100">{latest.slot.toLocaleString("en-US")}</span>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[12px] text-slate-500 dark:text-slate-400">Waiting for data.</div>
              )}
            </div>

            <div className="max-h-[300px] overflow-auto rounded-md border border-slate-200 dark:border-sky-400/12">
              <table className="w-full table-fixed border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-[#08131c] dark:text-slate-400">
                  <tr>
                    <th className="h-8 px-2 text-left">Time</th>
                    <th className="px-2 text-right">HF</th>
                    <th className="px-2 text-right">Debt</th>
                  </tr>
                </thead>
                <tbody>
                  {history.points.slice().reverse().map((point) => (
                    <tr key={`${point.slot}-${point.recordedAtMs}`} className="border-t border-slate-100 dark:border-sky-400/10">
                      <td className="h-8 truncate px-2 text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3 text-slate-400" />
                          {formatTime(point.recordedAtMs)}
                        </span>
                      </td>
                      <td className="px-2 text-right font-bold text-slate-900 dark:text-slate-100">{formatHf(point.hf)}</td>
                      <td className="px-2 text-right text-slate-700 dark:text-slate-300">{formatUsd(point.debtUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
