import { Bookmark, Clock3, DatabaseZap, Eye, X } from "lucide-react";
import type { RiskAccount } from "../types";
import { formatHf, formatUsd } from "../lib/format";
import { RiskBadge } from "./RiskBadge";

type AccountDetailsModalProps = {
  account: RiskAccount;
  watchlisted: boolean;
  onClose: () => void;
};

export function AccountDetailsModal({ account, watchlisted, onClose }: AccountDetailsModalProps) {
  const balances = account.balances ?? [];
  const positionsValue = balances.length.toLocaleString("en-US");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-5xl rounded-md border border-slate-200 bg-white shadow-[0_24px_80px_rgba(2,8,23,0.32)] dark:border-sky-400/20 dark:bg-[#08131c]">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-sky-400/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <Eye className="h-3.5 w-3.5" />
              Account Details
            </div>
            <div className="mt-1 truncate font-mono text-[12px] text-slate-900 dark:text-slate-100">
              {account.accountFull ?? account.account}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-sky-400 hover:text-sky-700 dark:border-sky-400/20 dark:text-slate-300 dark:hover:bg-sky-400/10 dark:hover:text-white"
            aria-label="Close account details"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-md border border-slate-200 bg-slate-50/80 p-4 dark:border-sky-400/12 dark:bg-black/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Health Factor
                </div>
                <div className="mt-2 font-mono text-4xl font-black text-slate-900 dark:text-white">
                  {formatHf(account.hf)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <RiskBadge risk={account.risk} />
                {watchlisted && (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 font-mono text-[10px] font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                    <Bookmark className="h-3 w-3" />
                    Watchlisted
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-200 bg-white/80 p-3 dark:border-sky-400/12 dark:bg-[#08131c]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Collateral</div>
                <div className="mt-1 font-mono text-[14px] font-bold text-slate-900 dark:text-slate-100">{formatUsd(account.collateralUsd)}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white/80 p-3 dark:border-sky-400/12 dark:bg-[#08131c]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Debt</div>
                <div className="mt-1 font-mono text-[14px] font-bold text-slate-900 dark:text-slate-100">{formatUsd(account.debtUsd)}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white/80 p-3 dark:border-sky-400/12 dark:bg-[#08131c]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Exposure</div>
                <div className="mt-1 font-mono text-[14px] font-bold text-slate-900 dark:text-slate-100">
                  {formatUsd(account.collateralUsd + account.debtUsd)}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50/80 p-4 dark:border-sky-400/12 dark:bg-black/20">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <DatabaseZap className="h-3.5 w-3.5" />
              Account Metadata
            </div>

            <div className="space-y-2 font-mono text-[12px]">
              <Row label="Account" value={account.accountFull ?? account.account} />
              <Row label="Wallet" value={account.walletFull ?? account.wallet} />
              <Row label="Protocol" value={account.protocol} />
              <Row label="Rank" value={`#${account.rank}`} />
              <Row label="Updated Slot" value={account.updatedSlot.toLocaleString("en-US")} />
              <Row label="Latency" value={`${account.latencyMs} ms`} />
              <Row label="RPC Endpoint" value={account.rpcEndpoint || "unknown"} />
              <Row label="Positions" value={positionsValue} />
            </div>

            <div className="rounded-md border border-slate-200 bg-white/80 p-3 dark:border-sky-400/12 dark:bg-[#08131c]">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                <span>Latest Snapshot</span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <Clock3 className="h-3 w-3" />
                  live
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="rounded border border-slate-200 px-2 py-1 text-slate-700 dark:border-sky-400/10 dark:text-slate-300">
                  slot {account.updatedSlot.toLocaleString("en-US")}
                </div>
                <div className="rounded border border-slate-200 px-2 py-1 text-slate-700 dark:border-sky-400/10 dark:text-slate-300">
                  {account.latencyMs} ms
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

type RowProps = {
  label: string;
  value: string;
};

function Row({ label, value }: RowProps) {
  return (
    <div className="grid grid-cols-[118px_1fr] gap-2 rounded border border-slate-200 bg-white/70 px-3 py-2 dark:border-sky-400/10 dark:bg-[#08131c]">
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="min-w-0 truncate text-right text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
