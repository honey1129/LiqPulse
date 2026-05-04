import { Bookmark, ChevronLeft, ChevronRight, ChevronsUpDown, MoreVertical } from "lucide-react";
import type { RiskAccount } from "../types";
import { formatHf, formatUsd } from "../lib/format";
import { ActionMenu } from "./ActionMenu";
import { RiskBadge } from "./RiskBadge";
import { Sparkline } from "./Sparkline";

type RiskAccountsTableProps = {
  accounts: RiskAccount[];
  selectedRank: number | null;
  openMenuRank: number | null;
  paused: boolean;
  watchlist: Set<string>;
  onSelectAccount: (account: RiskAccount) => void;
  onToggleMenu: (rank: number) => void;
  onAction: (action: string, account: RiskAccount) => void;
  onHeaderSort: (header: string) => void;
  onPageClick: (direction: "prev" | "next") => void;
};

const hfColor = (account: RiskAccount) => {
  if (account.hf === null) return "text-emerald-700 dark:text-emerald-300";
  if (account.risk === "Liquidatable") return "text-red-700 dark:text-red-300";
  if (account.risk === "High Risk") return "text-orange-700 dark:text-orange-300";
  if (account.risk === "Warning") return "text-yellow-700 dark:text-yellow-300";
  return "text-emerald-700 dark:text-emerald-300";
};

export function RiskAccountsTable({
  accounts,
  selectedRank,
  openMenuRank,
  paused,
  watchlist,
  onSelectAccount,
  onToggleMenu,
  onAction,
  onHeaderSort,
  onPageClick,
}: RiskAccountsTableProps) {
  return (
    <section className="relative rounded-md border border-slate-200 bg-white/85 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-sky-400/[0.12] dark:bg-ink-900/70 dark:shadow-none">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-700 dark:bg-black/[0.22] dark:text-slate-400">
          <tr className="border-b border-slate-200 dark:border-sky-400/[0.12]">
            {["#", "Account", "Wallet", "Protocol", "Collateral (USD)", "Debt (USD)", "HF", "Risk", "Updated Slot", "Latency", "Action"].map((header) => (
              <th
                key={header}
                className={`h-9 px-3 font-semibold ${header === "#" ? "w-[42px]" : ""} ${header === "Action" ? "w-[70px] text-center" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onHeaderSort(header)}
                  disabled={["#", "Risk", "Action"].includes(header)}
                  className="inline-flex items-center gap-1 disabled:cursor-default enabled:hover:text-sky-700 dark:enabled:hover:text-sky-300"
                >
                  {header}
                  {!["#", "Risk", "Action"].includes(header) && <ChevronsUpDown className="h-3 w-3" />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-[11px]">
          {accounts.map((account) => {
            const selected = selectedRank === account.rank;
            const watchlisted = watchlist.has(account.accountFull ?? account.account);
            return (
              <tr
                key={account.rank}
                onClick={() => onSelectAccount(account)}
                className={`group border-b border-slate-100 transition dark:border-sky-400/[0.09] ${
                  selected
                    ? "bg-sky-50 outline outline-1 outline-sky-400/70 dark:bg-sky-500/10 dark:outline-sky-500/80"
                    : account.risk === "No Debt"
                      ? "bg-slate-50 dark:bg-slate-800/25"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.025]"
                } cursor-pointer`}
              >
                <td className="h-[29px] px-3 text-slate-700 dark:text-slate-300">
                  {selected ? <span className="inline-block h-2 w-2 rounded-full bg-sky-300" /> : account.rank}
                </td>
                <td className="px-3 text-slate-700 dark:text-slate-200">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{account.account}</span>
                    {watchlisted && (
                      <span title="Watchlisted">
                        <Bookmark className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 text-slate-700 dark:text-slate-300">{account.wallet}</td>
                <td className="px-3 text-slate-700 dark:text-slate-200">{account.protocol}</td>
                <td className="px-3 text-right text-slate-800 dark:text-slate-100">{formatUsd(account.collateralUsd)}</td>
                <td className="px-3 text-right text-slate-800 dark:text-slate-100">{formatUsd(account.debtUsd)}</td>
                <td className={`px-3 text-right text-[13px] font-black ${hfColor(account)}`}>{formatHf(account.hf)}</td>
                <td className="px-3">
                  <div className="flex items-center gap-2">
                    <Sparkline data={account.trend} risk={account.risk} />
                    <RiskBadge risk={account.risk} />
                  </div>
                </td>
                <td className="px-3 text-right text-slate-700 dark:text-slate-300">{account.updatedSlot.toLocaleString("en-US")}</td>
                <td className="px-3 text-right font-bold text-emerald-700 dark:text-emerald-300">{account.latencyMs} ms</td>
                <td className="relative px-3 text-center">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMenu(account.rank);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-slate-400 hover:border-sky-400/30 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-400/10 dark:hover:text-white"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuRank === account.rank && <ActionMenu account={account} watchlisted={watchlisted} onAction={onAction} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="flex h-11 items-center justify-between px-4 text-[11px] font-medium text-slate-700 dark:text-slate-400">
        <div>Showing 1-{accounts.length} of {accounts.length}</div>
        <div className={`flex items-center gap-2 ${paused ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          <span className={`h-2 w-2 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-400 shadow-[0_0_10px_rgba(32,229,138,0.7)]"}`} />
          {paused ? "Paused" : "Auto-updating"}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onPageClick("prev")} className="rounded p-1 hover:bg-sky-400/10 hover:text-sky-300">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onPageClick("next")} className="h-7 w-7 rounded border border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/50 dark:bg-sky-500/[0.15] dark:text-sky-300">
            1
          </button>
          <button type="button" onClick={() => onPageClick("next")} className="rounded p-1 hover:bg-sky-400/10 hover:text-sky-300">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </section>
  );
}
