import { ChevronDown, Pause, Play, RefreshCcw, Search, SendHorizonal, SlidersHorizontal } from "lucide-react";
import type { RefreshInterval, RiskFilter, SortOption } from "../types";

type ControlBarProps = {
  protocol: string;
  riskFilter: RiskFilter;
  sortOption: SortOption;
  refreshInterval: RefreshInterval;
  search: string;
  paused: boolean;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  onProtocolChange: (protocol: string) => void;
  onRiskFilterChange: (filter: RiskFilter) => void;
  onSortChange: (sort: SortOption) => void;
  onRefreshIntervalChange: (interval: RefreshInterval) => void;
  onSearchChange: (value: string) => void;
  onTogglePaused: () => void;
  onManualRefresh: () => void;
  onToggleTelegram: () => void;
};

const riskFilters: RiskFilter[] = ["All Risks", "Liquidatable", "High Risk", "Warning", "Healthy", "No Debt"];
const sortOptions: SortOption[] = ["HF ASC, Size DESC", "HF DESC", "Size DESC", "Slot DESC", "Latency ASC"];
const refreshIntervals: RefreshInterval[] = ["500ms", "1s", "5s", "Manual"];

export function ControlBar({
  protocol,
  riskFilter,
  sortOption,
  refreshInterval,
  search,
  paused,
  telegramConfigured,
  telegramEnabled,
  onProtocolChange,
  onRiskFilterChange,
  onSortChange,
  onRefreshIntervalChange,
  onSearchChange,
  onTogglePaused,
  onManualRefresh,
  onToggleTelegram,
}: ControlBarProps) {
  return (
    <div className="grid grid-cols-[1.1fr_1fr_150px_98px_1fr] gap-3 rounded-md border border-slate-200 bg-white/80 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-sky-400/[0.12] dark:bg-ink-900/[0.55] dark:shadow-none">
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">Protocol</div>
        <label className="relative flex h-9 w-full items-center justify-between rounded-md border border-sky-300 bg-sky-50 px-3 text-[12px] text-slate-900 dark:border-sky-400/[0.45] dark:bg-sky-500/10 dark:text-slate-100">
          <span className="flex items-center gap-2">
            <span className="h-5 w-5 rounded bg-gradient-to-br from-sky-300 to-blue-800" />
            {protocol}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-400" />
          <select
            value={protocol}
            onChange={(event) => onProtocolChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Protocol"
          >
            <option value="marginfi v2">marginfi v2</option>
          </select>
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">Risk Filter</div>
        <label className="relative flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-200">
          {riskFilter}
          <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-500" />
          <select
            value={riskFilter}
            onChange={(event) => onRiskFilterChange(event.target.value as RiskFilter)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Risk filter"
          >
            {riskFilters.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="col-span-1">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">Sort</div>
        <label className="relative flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-[12px] text-slate-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-200">
          {sortOption}
          <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-500" />
          <select
            value={sortOption}
            onChange={(event) => onSortChange(event.target.value as SortOption)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Sort"
          >
            {sortOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-400">Refresh</div>
        <label className="relative flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-[12px] text-slate-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-200">
          {refreshInterval}
          <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-500" />
          <select
            value={refreshInterval}
            onChange={(event) => onRefreshIntervalChange(event.target.value as RefreshInterval)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Refresh interval"
          >
            {refreshIntervals.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-end gap-3">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-500">
          <Search className="h-4 w-4" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-600"
            placeholder="Search account or wallet..."
          />
          <span className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:text-slate-500">/</span>
        </label>
        <button
          type="button"
          onClick={onTogglePaused}
          title={paused ? "Resume live updates" : "Pause live updates"}
          className={`flex h-9 w-9 items-center justify-center rounded-md border ${
            paused
              ? "border-amber-400/45 bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
              : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/[0.45] dark:bg-sky-500/[0.15] dark:text-sky-300"
          }`}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onManualRefresh}
          title="Refresh now"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 hover:border-sky-400/40 hover:text-sky-600 dark:border-slate-700 dark:bg-black/20 dark:text-slate-400 dark:hover:text-sky-300"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="col-span-full flex items-center justify-between border-t border-slate-200 pt-2 dark:border-sky-400/10">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-400">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Adaptive filtering: marginfi lending accounts only, dataSize + discriminator memcmp enabled
        </div>
        <button
          type="button"
          onClick={onToggleTelegram}
          disabled={!telegramConfigured}
          title={!telegramConfigured ? "Telegram is not configured on the backend" : telegramEnabled ? "Disable Telegram alerts" : "Enable Telegram alerts"}
          className={`flex h-8 items-center gap-2 rounded-md border px-3 text-[11px] ${
            !telegramConfigured
              ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-black/20 dark:text-slate-500"
              : telegramEnabled
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
                : "border-sky-300 bg-sky-50 text-slate-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-slate-200"
          }`}
        >
          <SendHorizonal className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
          {!telegramConfigured ? "Telegram Unavailable" : "Telegram Alerts"}
          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${telegramEnabled ? "border-emerald-300 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300" : "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-500"}`}>
            {!telegramConfigured ? "N/A" : telegramEnabled ? "On" : "Off"}
          </span>
        </button>
      </div>
    </div>
  );
}
