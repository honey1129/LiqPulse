import { SendHorizonal } from "lucide-react";
import type { NavItem } from "../types";

type SidebarProps = {
  items: NavItem[];
  activeLabel: string;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  onSelect: (label: string) => void;
  onConfigureAlerts: () => void;
};

export function Sidebar({ items, activeLabel, telegramConfigured, telegramEnabled, onSelect, onConfigureAlerts }: SidebarProps) {
  return (
    <aside className="flex w-[148px] shrink-0 flex-col border-r border-slate-200 bg-white/90 px-2 py-3 dark:border-sky-400/10 dark:bg-ink-950/90">
      <div className="mb-4 flex h-9 items-center gap-2 px-2">
        <div className="relative h-7 w-7 text-sky-500 dark:text-sky-400">
          <svg viewBox="0 0 32 32" className="h-full w-full" fill="none">
            <path d="M2 17h5l3-8 5 16 4-12 3 4h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-base font-bold tracking-tight text-slate-950 dark:text-white">LiqPulse</span>
      </div>

      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.label === activeLabel;
          return (
            <button
              type="button"
              key={item.label}
              onClick={() => onSelect(item.label)}
              className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[12px] transition ${
                active
                  ? "border border-sky-400/50 bg-sky-50 text-sky-700 shadow-[0_8px_22px_rgba(14,165,233,0.14)] dark:border-sky-400/40 dark:bg-sky-500/[0.15] dark:text-sky-300 dark:shadow-glow"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.04] dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-sky-400/10 dark:bg-ink-900/[0.55]">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-300 bg-sky-50 text-sky-600 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
            <SendHorizonal className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Telegram Alerts</div>
            <div className={`text-[10px] ${!telegramConfigured ? "text-slate-600 dark:text-slate-500" : telegramEnabled ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
              {!telegramConfigured ? "Not Configured" : telegramEnabled ? "Enabled" : "Disabled"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onConfigureAlerts}
          className="h-8 w-full rounded border border-dashed border-slate-300 text-[11px] font-medium text-slate-700 hover:border-sky-400/60 hover:text-sky-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400/40 dark:hover:text-sky-300"
        >
          Configure
        </button>
      </div>

      <div className="mt-7 px-2 text-[10px] text-slate-400 dark:text-slate-500">v1.3.0</div>
    </aside>
  );
}
