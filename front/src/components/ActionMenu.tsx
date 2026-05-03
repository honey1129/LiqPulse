import { Bookmark, Copy, Eye, History, Layers3 } from "lucide-react";
import type { RiskAccount } from "../types";

const actions = [
  { label: "View Details", icon: Eye },
  { label: "View Positions", icon: Layers3 },
  { label: "Account History", icon: History },
  { label: "Add to Watchlist", icon: Bookmark },
  { label: "Copy Address", icon: Copy },
];

type ActionMenuProps = {
  account: RiskAccount;
  onAction: (action: string, account: RiskAccount) => void;
};

export function ActionMenu({ account, onAction }: ActionMenuProps) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-2 top-8 z-20 w-[158px] rounded-md border border-slate-200 bg-white p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.18)] dark:border-sky-400/[0.18] dark:bg-[#08131c] dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            type="button"
            key={action.label}
            onClick={() => onAction(action.label, account)}
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] text-slate-600 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-sky-400/10 dark:hover:text-white"
          >
            <Icon className="h-3.5 w-3.5 text-slate-400" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
