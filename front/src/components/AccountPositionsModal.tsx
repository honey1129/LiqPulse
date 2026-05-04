import { DatabaseZap, Layers3, X } from "lucide-react";
import type { AccountBalance, RiskAccount } from "../types";
import { formatDecimalText } from "../lib/format";

type AccountPositionsModalProps = {
  account: RiskAccount;
  onClose: () => void;
};

const totalShares = (balances: AccountBalance[], key: "assetShares" | "liabilityShares") =>
  balances.reduce((sum, item) => {
    const next = Number(item[key] || 0);
    return Number.isFinite(next) ? sum + next : sum;
  }, 0);

export function AccountPositionsModal({ account, onClose }: AccountPositionsModalProps) {
  const balances = account.balances ?? [];
  const assetTotal = totalShares(balances, "assetShares");
  const liabilityTotal = totalShares(balances, "liabilityShares");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-5xl rounded-md border border-slate-200 bg-white shadow-[0_24px_80px_rgba(2,8,23,0.32)] dark:border-sky-400/20 dark:bg-[#08131c]">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-sky-400/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <Layers3 className="h-3.5 w-3.5" />
              View Positions
            </div>
            <div className="mt-1 truncate font-mono text-[12px] text-slate-900 dark:text-slate-100">
              {account.accountFull ?? account.account}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-sky-400 hover:text-sky-700 dark:border-sky-400/20 dark:text-slate-300 dark:hover:bg-sky-400/10 dark:hover:text-white"
            aria-label="Close account positions"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[320px_1fr]">
          <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50/80 p-4 dark:border-sky-400/12 dark:bg-black/20">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              <DatabaseZap className="h-3.5 w-3.5" />
              Position Summary
            </div>

            <SummaryRow label="Active Positions" value={balances.length.toLocaleString("en-US")} />
            <SummaryRow label="Total Asset Shares" value={formatDecimalText(assetTotal, 6)} />
            <SummaryRow label="Total Liability Shares" value={formatDecimalText(liabilityTotal, 6)} />

            {balances.length === 0 && (
              <div className="rounded-md border border-slate-200 bg-white/80 p-3 font-mono text-[12px] text-slate-500 dark:border-sky-400/12 dark:bg-[#08131c] dark:text-slate-400">
                No active balances available on this snapshot.
              </div>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-slate-50/80 p-4 dark:border-sky-400/12 dark:bg-black/20">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Bank Balances
            </div>

            {balances.length > 0 ? (
              <div className="overflow-auto rounded-md border border-slate-200 dark:border-sky-400/12">
                <table className="w-full table-fixed border-collapse font-mono text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-[#08131c] dark:text-slate-400">
                    <tr>
                      <th className="h-8 px-2 text-left">Bank</th>
                      <th className="px-2 text-right">Asset Shares</th>
                      <th className="px-2 text-right">Liability Shares</th>
                      <th className="px-2 text-right">Last Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((balance, index) => (
                      <tr key={`${balance.bankPk}-${balance.lastUpdate}-${index}`} className="border-t border-slate-100 dark:border-sky-400/10">
                        <td className="h-8 truncate px-2 text-slate-700 dark:text-slate-200">{balance.bankPk}</td>
                        <td className="px-2 text-right text-slate-900 dark:text-slate-100">{formatDecimalText(balance.assetShares, 6)}</td>
                        <td className="px-2 text-right text-slate-900 dark:text-slate-100">{formatDecimalText(balance.liabilityShares, 6)}</td>
                        <td className="px-2 text-right text-slate-600 dark:text-slate-400">{balance.lastUpdate.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white/80 p-4 font-mono text-[12px] text-slate-500 dark:border-sky-400/12 dark:bg-[#08131c] dark:text-slate-400">
                No positions to display yet.
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

type SummaryRowProps = {
  label: string;
  value: string;
};

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded border border-slate-200 bg-white/80 px-3 py-2 font-mono text-[12px] dark:border-sky-400/10 dark:bg-[#08131c]">
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-right text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
