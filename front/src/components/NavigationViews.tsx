import {
  Activity,
  Bell,
  Bookmark,
  DatabaseZap,
  Eye,
  HeartPulse,
  Layers3,
  LineChart,
  Network,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RadarStat, RiskAccount, SourceStatus, StreamStatus, ThemeMode } from "../types";
import { formatDecimalText, formatHf, formatNumber, formatUsd } from "../lib/format";
import { Panel } from "./Panel";
import { RiskBadge } from "./RiskBadge";
import { StatusPill } from "./StatusPill";

type ViewProps = {
  accounts: RiskAccount[];
  sourceStatus: SourceStatus[];
  topStats: RadarStat[];
  streamStatus: StreamStatus;
  watchlist: Set<string>;
  telegramEnabled: boolean;
  theme: ThemeMode;
  refreshInterval: string;
  paused: boolean;
  onOpenDetails: (account: RiskAccount) => void;
  onOpenPositions: (account: RiskAccount) => void;
  onOpenHistory: (account: RiskAccount) => void;
  onToggleWatchlist: (account: RiskAccount) => void;
  onToggleTelegram: () => void;
  onToggleTheme: () => void;
  onClearWatchlist: () => void;
};

const accountKey = (account: RiskAccount) => account.accountFull ?? account.account;

const riskOrder = ["Liquidatable", "High Risk", "Warning", "Healthy", "No Debt", "Invalid"] as const;

const riskTone = {
  Liquidatable: "red",
  "High Risk": "amber",
  Warning: "amber",
  Healthy: "green",
  "No Debt": "muted",
  Invalid: "muted",
} as const;

const totalExposure = (accounts: RiskAccount[]) =>
  accounts.reduce((sum, account) => sum + account.collateralUsd + account.debtUsd, 0);

const totalDebt = (accounts: RiskAccount[]) => accounts.reduce((sum, account) => sum + account.debtUsd, 0);

const totalCollateral = (accounts: RiskAccount[]) => accounts.reduce((sum, account) => sum + account.collateralUsd, 0);

const watchedAccounts = (accounts: RiskAccount[], watchlist: Set<string>) =>
  accounts.filter((account) => watchlist.has(accountKey(account)));

export function AlertsView({ accounts, watchlist, telegramEnabled, onToggleTelegram, onOpenDetails }: ViewProps) {
  const risky = accounts.filter((account) => ["Liquidatable", "High Risk", "Warning"].includes(account.risk));
  const watched = watchedAccounts(accounts, watchlist);

  return (
    <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Alert Channels">
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-sky-400/12 dark:bg-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-slate-900 dark:text-white">Telegram</div>
              <StatusPill label={telegramEnabled ? "Enabled" : "Disabled"} tone={telegramEnabled ? "green" : "muted"} />
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleTelegram}
            className="h-8 rounded-md border border-sky-300 bg-sky-50 px-3 text-[11px] font-semibold text-sky-700 hover:border-sky-400 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200"
          >
            {telegramEnabled ? "Disable" : "Enable"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Risk Accounts" value={formatNumber(risky.length)} />
          <Metric label="Watchlist" value={formatNumber(watched.length)} />
          <Metric label="Debt" value={formatUsd(totalDebt(risky))} />
        </div>
      </Panel>

      <Panel title="Triggered Accounts">
        <AccountList
          accounts={risky.slice(0, 8)}
          empty="No risk accounts in the current snapshot."
          actionLabel="Details"
          onAction={onOpenDetails}
        />
      </Panel>
    </div>
  );
}

export function PositionsView({ accounts, onOpenPositions }: ViewProps) {
  const rows = accounts.flatMap((account) =>
    (account.balances ?? []).map((balance) => ({
      account,
      balance,
    })),
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Panel title="Position Exposure">
        <div className="space-y-2">
          <Metric label="Accounts" value={formatNumber(accounts.length)} />
          <Metric label="Positions" value={formatNumber(rows.length)} />
          <Metric label="Collateral" value={formatUsd(totalCollateral(accounts))} />
          <Metric label="Debt" value={formatUsd(totalDebt(accounts))} />
        </div>
      </Panel>

      <Panel title="Active Positions">
        {rows.length > 0 ? (
          <div className="overflow-auto rounded-md border border-slate-200 dark:border-sky-400/12">
            <table className="w-full table-fixed border-collapse font-mono text-[11px]">
              <thead className="bg-slate-100 text-slate-600 dark:bg-black/25 dark:text-slate-400">
                <tr>
                  <th className="h-8 px-2 text-left">Account</th>
                  <th className="px-2 text-left">Bank</th>
                  <th className="px-2 text-right">Asset Shares</th>
                  <th className="px-2 text-right">Liability Shares</th>
                  <th className="px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 18).map(({ account, balance }, index) => (
                  <tr key={`${account.account}-${balance.bankPk}-${index}`} className="border-t border-slate-100 dark:border-sky-400/10">
                    <td className="h-8 truncate px-2 text-slate-800 dark:text-slate-100">{account.account}</td>
                    <td className="truncate px-2 text-slate-600 dark:text-slate-300">{balance.bankPk}</td>
                    <td className="px-2 text-right text-slate-800 dark:text-slate-100">{formatDecimalText(balance.assetShares, 6)}</td>
                    <td className="px-2 text-right text-slate-800 dark:text-slate-100">{formatDecimalText(balance.liabilityShares, 6)}</td>
                    <td className="px-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenPositions(account)}
                        className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Layers3} text="No active balances available in the current snapshot." />
        )}
      </Panel>
    </div>
  );
}

export function AccountsView({ accounts, watchlist, onOpenDetails, onOpenHistory, onToggleWatchlist }: ViewProps) {
  const watched = watchedAccounts(accounts, watchlist);
  const list = watched.length > 0 ? watched : accounts;

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Panel title="Account Coverage">
        <div className="space-y-2">
          <Metric label="Tracked Accounts" value={formatNumber(accounts.length)} />
          <Metric label="Watchlisted" value={formatNumber(watched.length)} />
          <Metric label="Average HF" value={averageHf(accounts)} />
        </div>
      </Panel>
      <Panel title={watched.length > 0 ? "Watchlist" : "Accounts"}>
        <div className="space-y-2">
          {list.slice(0, 12).map((account) => (
            <div key={accountKey(account)} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-sky-400/10 dark:bg-black/20">
              <div className="min-w-0">
                <div className="truncate font-mono text-[12px] text-slate-900 dark:text-slate-100">{account.accountFull ?? account.account}</div>
                <div className="mt-1 flex items-center gap-2">
                  <RiskBadge risk={account.risk} />
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">HF {formatHf(account.hf)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton label="Details" icon={Eye} onClick={() => onOpenDetails(account)} />
                <IconButton label="History" icon={Activity} onClick={() => onOpenHistory(account)} />
                <IconButton label="Watchlist" icon={Bookmark} onClick={() => onToggleWatchlist(account)} active={watchlist.has(accountKey(account))} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function MarketDataView({ accounts }: ViewProps) {
  const counts = riskOrder.map((risk) => ({
    risk,
    count: accounts.filter((account) => account.risk === risk).length,
  }));

  return (
    <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Market Exposure">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Collateral" value={formatUsd(totalCollateral(accounts))} />
          <Metric label="Debt" value={formatUsd(totalDebt(accounts))} />
          <Metric label="Exposure" value={formatUsd(totalExposure(accounts))} />
          <Metric label="Average HF" value={averageHf(accounts)} />
        </div>
      </Panel>
      <Panel title="Risk Distribution">
        <div className="space-y-2">
          {counts.map((item) => (
            <div key={item.risk} className="grid grid-cols-[110px_1fr_54px] items-center gap-3 font-mono text-[11px]">
              <StatusPill label={item.risk} tone={riskTone[item.risk]} />
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full rounded-full bg-sky-400" style={{ width: `${accounts.length ? (item.count / accounts.length) * 100 : 0}%` }} />
              </div>
              <div className="text-right text-slate-700 dark:text-slate-300">{item.count}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function HealthView({ accounts, sourceStatus, topStats, streamStatus }: ViewProps) {
  const risky = accounts.filter((account) => ["Liquidatable", "High Risk", "Warning"].includes(account.risk)).length;
  const connected = streamStatus === "connected";

  return (
    <div className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
      <Panel title="Runtime Health">
        <div className="space-y-2">
          <Metric label="Stream" value={streamStatus} tone={connected ? "green" : "amber"} />
          <Metric label="Risk Accounts" value={formatNumber(risky)} tone={risky > 0 ? "amber" : "green"} />
          <Metric label="Tracked Accounts" value={formatNumber(accounts.length)} />
        </div>
      </Panel>
      <Panel title="Telemetry">
        <div className="grid grid-cols-2 gap-2">
          {topStats.map((stat) => (
            <Metric key={stat.label} label={stat.label} value={stat.value} tone={stat.tone === "red" ? "red" : stat.tone === "amber" ? "amber" : "green"} />
          ))}
          {sourceStatus.map((item) => (
            <Metric key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function RpcNodesView({ accounts, sourceStatus }: ViewProps) {
  const endpoints = new Map<string, number>();
  for (const account of accounts) {
    const endpoint = account.rpcEndpoint || "unknown";
    endpoints.set(endpoint, (endpoints.get(endpoint) ?? 0) + 1);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Panel title="Connection">
        <div className="space-y-2">
          {sourceStatus.map((item) => (
            <Metric key={item.label} label={item.label} value={item.value} tone={item.kind === "success" ? "green" : "blue"} />
          ))}
        </div>
      </Panel>
      <Panel title="RPC Endpoints">
        {Array.from(endpoints.entries()).length > 0 ? (
          <div className="space-y-2">
            {Array.from(endpoints.entries()).map(([endpoint, count]) => (
              <div key={endpoint} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] dark:border-sky-400/10 dark:bg-black/20">
                <div className="truncate text-slate-800 dark:text-slate-100">{endpoint}</div>
                <div className="text-slate-600 dark:text-slate-300">{formatNumber(count)}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={WalletCards} text="No endpoint data in the current snapshot." />
        )}
      </Panel>
    </div>
  );
}

export function SettingsView({
  telegramEnabled,
  theme,
  refreshInterval,
  paused,
  watchlist,
  onToggleTelegram,
  onToggleTheme,
  onClearWatchlist,
}: ViewProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Runtime Settings">
        <div className="space-y-2">
          <SettingRow label="Theme" value={theme} action="Toggle" icon={Settings} onClick={onToggleTheme} />
          <SettingRow label="Telegram Alerts" value={telegramEnabled ? "Enabled" : "Disabled"} action={telegramEnabled ? "Disable" : "Enable"} icon={Bell} onClick={onToggleTelegram} />
          <SettingRow label="Live Updates" value={paused ? "Paused" : "Running"} action="Managed in toolbar" icon={Activity} />
        </div>
      </Panel>
      <Panel title="Local Preferences">
        <div className="space-y-2">
          <Metric label="Refresh Interval" value={refreshInterval} />
          <Metric label="Watchlist Items" value={formatNumber(watchlist.size)} />
          <button
            type="button"
            onClick={onClearWatchlist}
            disabled={watchlist.size === 0}
            className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-700 hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-black/20 dark:text-slate-300"
          >
            Clear Watchlist
          </button>
        </div>
      </Panel>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: string;
  tone?: "green" | "blue" | "amber" | "red" | "muted";
};

function Metric({ label, value, tone = "blue" }: MetricProps) {
  const toneClass = {
    green: "text-emerald-700 dark:text-emerald-300",
    blue: "text-sky-700 dark:text-sky-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-red-700 dark:text-red-300",
    muted: "text-slate-700 dark:text-slate-300",
  }[tone];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-sky-400/10 dark:bg-black/20">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 truncate font-mono text-[13px] font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

type AccountListProps = {
  accounts: RiskAccount[];
  empty: string;
  actionLabel: string;
  onAction: (account: RiskAccount) => void;
};

function AccountList({ accounts, empty, actionLabel, onAction }: AccountListProps) {
  if (accounts.length === 0) return <EmptyState icon={ShieldCheck} text={empty} />;

  return (
    <div className="space-y-2">
      {accounts.map((account) => (
        <div key={accountKey(account)} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-sky-400/10 dark:bg-black/20">
          <div className="min-w-0">
            <div className="truncate font-mono text-[12px] text-slate-900 dark:text-slate-100">{account.accountFull ?? account.account}</div>
            <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">HF {formatHf(account.hf)}</div>
          </div>
          <RiskBadge risk={account.risk} />
          <button
            type="button"
            onClick={() => onAction(account)}
            className="h-8 rounded border border-sky-300 bg-sky-50 px-2 text-[10px] font-semibold text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200"
          >
            {actionLabel}
          </button>
        </div>
      ))}
    </div>
  );
}

type IconButtonProps = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
};

function IconButton({ label, icon: Icon, active = false, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded border ${
        active
          ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300"
          : "border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-black/20 dark:text-slate-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

type SettingRowProps = {
  label: string;
  value: string;
  action: string;
  icon: LucideIcon;
  onClick?: () => void;
};

function SettingRow({ label, value, action, icon: Icon, onClick }: SettingRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-sky-400/10 dark:bg-black/20">
      <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
      <div>
        <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{label}</div>
        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{value}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="h-8 rounded border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 disabled:cursor-default disabled:opacity-60 dark:border-slate-700 dark:bg-black/20 dark:text-slate-300"
      >
        {action}
      </button>
    </div>
  );
}

function averageHf(accounts: RiskAccount[]) {
  const values = accounts.map((account) => account.hf).filter((value): value is number => value !== null);
  if (values.length === 0) return "INF";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4);
}

type EmptyStateProps = {
  icon: LucideIcon;
  text: string;
};

function EmptyState({ icon: Icon, text }: EmptyStateProps) {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-center font-mono text-[12px] text-slate-500 dark:border-slate-700 dark:bg-black/20 dark:text-slate-400">
      <div>
        <Icon className="mx-auto mb-2 h-5 w-5" />
        {text}
      </div>
    </div>
  );
}
