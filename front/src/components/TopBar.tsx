import { Clock3, Moon, Settings, SunMedium } from "lucide-react";
import type { RadarStat, ThemeMode } from "../types";

type TopBarProps = {
  stats: RadarStat[];
  theme: ThemeMode;
  onToggleTheme: () => void;
  settingsActive: boolean;
  onOpenSettings: () => void;
};

const statTone = {
  green: "text-emerald-700 dark:text-emerald-300",
  blue: "text-sky-700 dark:text-sky-300",
  amber: "text-amber-700 dark:text-amber-300",
  red: "text-red-700 dark:text-red-300",
  neutral: "text-slate-900 dark:text-slate-200",
};

export function TopBar({ stats, theme, onToggleTheme, settingsActive, onOpenSettings }: TopBarProps) {
  return (
    <header className="flex h-12 items-center border-b border-slate-200/80 bg-white/85 px-3 backdrop-blur dark:border-sky-400/10 dark:bg-ink-950/80">
      <div className="flex flex-1 items-center justify-end gap-6">
        {stats.map((item) => (
          <div key={item.label} className="min-w-fit">
            <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">{item.label}</div>
            <div className={`font-mono text-[13px] font-bold ${statTone[item.tone ?? "neutral"]}`}>{item.value}</div>
          </div>
        ))}
        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
            <Clock3 className="h-3.5 w-3.5" />
            12:34:56 UTC
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Open settings"
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${
              settingsActive
                ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/[0.15] dark:text-sky-300"
                : "border-slate-300 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            OP
          </div>
        </div>
      </div>
    </header>
  );
}
