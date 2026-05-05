import { useEffect, useMemo, useState } from "react";
import { ControlBar } from "./components/ControlBar";
import { AccountDetailsModal } from "./components/AccountDetailsModal";
import { AccountHistoryModal } from "./components/AccountHistoryModal";
import { AccountPositionsModal } from "./components/AccountPositionsModal";
import { RiskAccountsTable } from "./components/RiskAccountsTable";
import { Sidebar } from "./components/Sidebar";
import { SummaryPanels } from "./components/SummaryPanels";
import { TopBar } from "./components/TopBar";
import {
  AccountsView,
  AlertsView,
  HealthView,
  MarketDataView,
  PositionsView,
  SettingsView,
} from "./components/NavigationViews";
import { navItems, thresholds } from "./data/mockData";
import { useRadarStream } from "./hooks/useRadarStream";
import type { RefreshInterval, RiskAccount, RiskFilter, SortOption, ThemeMode } from "./types";

const WATCHLIST_STORAGE_KEY = "liqpulse-watchlist";

const accountKey = (account: RiskAccount) => account.accountFull ?? account.account;

const loadStoredWatchlist = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

function App() {
  const [activeNav, setActiveNav] = useState(navItems[0].label);
  const [protocol, setProtocol] = useState("marginfi v2");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("All Risks");
  const [sortOption, setSortOption] = useState<SortOption>("HF ASC, Size DESC");
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("1s");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [selectedRank, setSelectedRank] = useState<number | null>(6);
  const [openMenuRank, setOpenMenuRank] = useState<number | null>(6);
  const [copiedProgram, setCopiedProgram] = useState(false);
  const [toast, setToast] = useState("Ready");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [detailsAccount, setDetailsAccount] = useState<RiskAccount | null>(null);
  const [positionsAccount, setPositionsAccount] = useState<RiskAccount | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(loadStoredWatchlist);
  const radar = useRadarStream({ paused, refreshInterval });
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast("Ready"), 2200);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const closeAccountPanels = () => {
    setDetailsAccount(null);
    setPositionsAccount(null);
    radar.clearAccountHistory();
  };

  const visibleAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = radar.accounts.filter((account) => {
      const riskMatch = riskFilter === "All Risks" || account.risk === riskFilter;
      const searchMatch =
        normalizedSearch.length === 0 ||
        account.account.toLowerCase().includes(normalizedSearch) ||
        account.wallet.toLowerCase().includes(normalizedSearch) ||
        account.protocol.toLowerCase().includes(normalizedSearch);
      return riskMatch && searchMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === "HF DESC") {
        return (b.hf ?? -1) - (a.hf ?? -1);
      }
      if (sortOption === "Size DESC") {
        return b.collateralUsd + b.debtUsd - (a.collateralUsd + a.debtUsd);
      }
      if (sortOption === "Slot DESC") {
        return b.updatedSlot - a.updatedSlot;
      }
      if (sortOption === "Latency ASC") {
        return a.latencyMs - b.latencyMs;
      }

      const hfDiff = (a.hf ?? Number.POSITIVE_INFINITY) - (b.hf ?? Number.POSITIVE_INFINITY);
      if (hfDiff !== 0) return hfDiff;
      return b.collateralUsd + b.debtUsd - (a.collateralUsd + a.debtUsd);
    });
  }, [radar.accounts, riskFilter, search, sortOption]);

  const handleNavSelect = (label: string) => {
    closeAccountPanels();
    setOpenMenuRank(null);
    setActiveNav(label);
    notify(`${label} selected`);
  };

  const handleProtocolChange = (value: string) => {
    setProtocol(value);
    notify("Protocol set to marginfi v2");
  };

  const handleCopyProgram = () => {
    const programId = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
    void navigator.clipboard?.writeText(programId);
    setCopiedProgram(true);
    notify("Program ID copied");
    window.setTimeout(() => setCopiedProgram(false), 1800);
  };

  const handleTelegramToggle = () => {
    if (!radar.telegramConfigured) {
      notify("Telegram is not configured on the backend");
      return;
    }

    const next = !radar.telegramEnabled;
    if (!radar.setTelegramEnabled(next)) {
      notify("Telegram alerts are unavailable until the stream is connected");
      return;
    }

    notify(next ? "Telegram alerts enabled" : "Telegram alerts disabled");
  };

  const openDetails = (account: RiskAccount) => {
    closeAccountPanels();
    setDetailsAccount(account);
    setSelectedRank(account.rank);
    setOpenMenuRank(null);
    notify(`Details opened for ${account.account}`);
  };

  const openPositions = (account: RiskAccount) => {
    closeAccountPanels();
    setPositionsAccount(account);
    setSelectedRank(account.rank);
    setOpenMenuRank(null);
    notify(`Positions opened for ${account.account}`);
  };

  const openHistory = (account: RiskAccount) => {
    closeAccountPanels();
    radar.requestAccountHistory(account);
    setSelectedRank(account.rank);
    setOpenMenuRank(null);
    notify(`History requested for ${account.account}`);
  };

  const toggleWatchlist = (account: RiskAccount) => {
    const key = accountKey(account);
    const exists = watchlistSet.has(key);
    setWatchlist((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setSelectedRank(account.rank);
    setOpenMenuRank(null);
    notify(exists ? `Removed ${account.account} from watchlist` : `Added ${account.account} to watchlist`);
  };

  const clearWatchlist = () => {
    setWatchlist([]);
    notify("Watchlist cleared");
  };

  const handleAccountAction = (action: string, account: RiskAccount) => {
    if (action === "Copy Address") {
      void navigator.clipboard?.writeText(account.accountFull ?? account.account);
      setSelectedRank(account.rank);
      setOpenMenuRank(null);
      notify(`Copied ${account.account}`);
      return;
    }
    if (action === "View Details") {
      openDetails(account);
      return;
    }
    if (action === "View Positions") {
      openPositions(account);
      return;
    }
    if (action === "Account History") {
      openHistory(account);
      return;
    }
    if (action === "Add to Watchlist" || action === "Remove from Watchlist") {
      toggleWatchlist(account);
      return;
    }
    setSelectedRank(account.rank);
    setOpenMenuRank(null);
    notify(`${action}: ${account.account}`);
  };

  const handleHeaderSort = (header: string) => {
    if (header === "HF") setSortOption(sortOption === "HF DESC" ? "HF ASC, Size DESC" : "HF DESC");
    if (header === "Collateral (USD)" || header === "Debt (USD)") setSortOption("Size DESC");
    if (header === "Updated Slot") setSortOption("Slot DESC");
    if (header === "Latency") setSortOption("Latency ASC");
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    notify(nextTheme === "dark" ? "Dark mode enabled" : "Light mode enabled");
  };

  const viewProps = {
    accounts: radar.accounts,
    sourceStatus: radar.sourceStatus,
    topStats: radar.topStats,
    streamStatus: radar.status,
    watchlist: watchlistSet,
    telegramConfigured: radar.telegramConfigured,
    telegramEnabled: radar.telegramEnabled,
    theme,
    refreshInterval,
    paused,
    onOpenDetails: openDetails,
    onOpenPositions: openPositions,
    onOpenHistory: openHistory,
    onToggleWatchlist: toggleWatchlist,
    onToggleTelegram: handleTelegramToggle,
    onToggleTheme: handleThemeToggle,
    onClearWatchlist: clearWatchlist,
  };

  const sharedControlBar = (
    <ControlBar
      protocol={protocol}
      riskFilter={riskFilter}
      sortOption={sortOption}
      refreshInterval={refreshInterval}
      search={search}
      paused={paused}
      telegramConfigured={radar.telegramConfigured}
      telegramEnabled={radar.telegramEnabled}
      onProtocolChange={handleProtocolChange}
      onRiskFilterChange={(filter) => {
        setRiskFilter(filter);
        notify(`Risk filter: ${filter}`);
      }}
      onSortChange={(sort) => {
        setSortOption(sort);
        notify(`Sort: ${sort}`);
      }}
      onRefreshIntervalChange={(interval) => {
        setRefreshInterval(interval);
        notify(`Refresh interval: ${interval}`);
      }}
      onSearchChange={(value) => {
        setSearch(value);
        setOpenMenuRank(null);
      }}
      onTogglePaused={() => {
        setPaused((value) => {
          const next = !value;
          notify(next ? "Live updates paused" : "Live updates resumed");
          return next;
        });
      }}
      onManualRefresh={() => {
        const applied = radar.requestSnapshot();
        notify(applied ? "Snapshot refresh requested" : "Live stream is not connected");
      }}
      onToggleTelegram={handleTelegramToggle}
    />
  );

  const sharedRiskAccountsTable = (
    <RiskAccountsTable
      accounts={visibleAccounts}
      selectedRank={selectedRank}
      openMenuRank={openMenuRank}
      paused={paused}
      watchlist={watchlistSet}
      onSelectAccount={(account) => {
        setSelectedRank(account.rank);
        setOpenMenuRank(null);
        notify(`Selected ${account.account}`);
      }}
      onToggleMenu={(rank) => {
        setOpenMenuRank((current) => (current === rank ? null : rank));
        setSelectedRank(rank);
      }}
      onAction={handleAccountAction}
      onHeaderSort={handleHeaderSort}
      onPageClick={(direction) => notify(`Pagination ${direction}`)}
    />
  );

  const renderContent = () => {
    switch (activeNav) {
      case "Workbench":
        return (
          <>
            <SummaryPanels
              sourceStatus={radar.sourceStatus}
              thresholds={thresholds}
              copiedProgram={copiedProgram}
              onCopyProgram={handleCopyProgram}
            />
            {sharedControlBar}
            {sharedRiskAccountsTable}
          </>
        );
      case "Risk Accounts":
        return (
          <>
            {sharedControlBar}
            {sharedRiskAccountsTable}
          </>
        );
      case "Alerts":
        return <AlertsView {...viewProps} />;
      case "Positions":
        return <PositionsView {...viewProps} />;
      case "Accounts":
        return <AccountsView {...viewProps} />;
      case "Market Data":
        return <MarketDataView {...viewProps} />;
      case "Health":
        return <HealthView {...viewProps} />;
      case "Settings":
        return <SettingsView {...viewProps} />;
      default:
        return (
          <>
            {sharedControlBar}
            {sharedRiskAccountsTable}
          </>
        );
    }
  };

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="grid-bg flex min-h-screen bg-slate-100 text-slate-900 transition-colors dark:bg-ink-950 dark:text-slate-100">
        <Sidebar
          items={navItems}
          activeLabel={activeNav}
          telegramConfigured={radar.telegramConfigured}
          telegramEnabled={radar.telegramEnabled}
          streamStatus={radar.status}
          paused={paused}
          onSelect={handleNavSelect}
          onConfigureAlerts={() => {
            closeAccountPanels();
            setOpenMenuRank(null);
            setActiveNav("Settings");
            notify("Telegram settings opened");
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar
            stats={radar.topStats}
            theme={theme}
            settingsActive={activeNav === "Settings"}
            onToggleTheme={handleThemeToggle}
            onOpenSettings={() => handleNavSelect("Settings")}
          />
          <div className="flex-1 space-y-3 p-3">{renderContent()}</div>
        </main>
        {detailsAccount && (
          <AccountDetailsModal
            account={detailsAccount}
            watchlisted={watchlistSet.has(accountKey(detailsAccount))}
            onClose={() => {
              setDetailsAccount(null);
              notify("Details panel closed");
            }}
          />
        )}
        {positionsAccount && (
          <AccountPositionsModal
            account={positionsAccount}
            onClose={() => {
              setPositionsAccount(null);
              notify("Positions panel closed");
            }}
          />
        )}
        {radar.history.account && (
          <AccountHistoryModal
            history={radar.history}
            onClose={() => {
              radar.clearAccountHistory();
              notify("History panel closed");
            }}
          />
        )}
        <div className="fixed bottom-4 right-4 z-50 min-w-[220px] rounded-md border border-slate-200 bg-white/95 px-4 py-3 text-[12px] text-slate-700 shadow-[0_18px_48px_rgba(2,8,23,0.18)] dark:border-sky-400/20 dark:bg-[#07121b]/95 dark:text-slate-200 dark:shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
            Interaction
          </div>
          {toast}
        </div>
      </div>
    </div>
  );
}

export default App;
