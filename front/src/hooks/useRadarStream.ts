import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { riskAccounts as mockAccounts, sourceStatus as mockSourceStatus, topStats as mockTopStats } from "../data/mockData";
import type { AccountHistoryPoint, AccountHistoryState, RadarStat, RefreshInterval, RiskAccount, RiskLevel, SourceStatus, StreamStatus } from "../types";

type ApiStats = {
  accountsTotal: number;
  riskAccounts: number;
  liquidatable: number;
  high: number;
  warning: number;
  healthy: number;
  noDebt: number;
  invalid: number;
  cacheCapacity: number;
  cacheEvictions: number;
  updatesProcessed: number;
  updatesSkipped: number;
  lastSlot: number;
  lastRpcEndpoint: string;
};

type ApiSnapshot = {
  type: "snapshot";
  protocol: string;
  accountLabel: string;
  programId: string;
  generatedAtMs: number;
  rpcEndpoint: string;
  queueDepth: number;
  alerts?: ApiAlerts;
  stats: ApiStats;
  accounts: RiskAccount[];
};

type ApiAccountHistory = {
  type: "account_history";
  requestId: string;
  account: string;
  accountFull: string;
  count: number;
  points: AccountHistoryPoint[];
  error?: string;
};

type ApiAlertSettings = {
  type: "alert_settings";
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  changed: boolean;
};

type ApiAlerts = {
  telegramConfigured: boolean;
  telegramEnabled: boolean;
};

type UseRadarStreamOptions = {
  paused: boolean;
  refreshInterval: RefreshInterval;
};

type RadarStreamState = {
  accounts: RiskAccount[];
  topStats: RadarStat[];
  sourceStatus: SourceStatus[];
  status: StreamStatus;
  snapshot: ApiSnapshot | null;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  history: AccountHistoryState;
  requestSnapshot: () => boolean;
  requestAccountHistory: (account: RiskAccount, limit?: number) => void;
  setTelegramEnabled: (enabled: boolean) => boolean;
  clearAccountHistory: () => void;
};

const fallbackUrl = "ws://127.0.0.1:8765";

const fallbackEnabled = (raw: unknown) => String(raw ?? "").trim().toLowerCase();

const allowMockFallback = import.meta.env.DEV || ["1", "true", "yes", "on"].includes(fallbackEnabled(import.meta.env.VITE_RADAR_ALLOW_MOCK_FALLBACK));

const emptyTopStats: RadarStat[] = [
  { label: "Slot", value: "--", tone: "neutral" },
  { label: "Latency", value: "--", tone: "neutral" },
  { label: "Queue Depth", value: "--", tone: "neutral" },
  { label: "Process Rate", value: "--", tone: "neutral" },
  { label: "Processed", value: "--", tone: "neutral" },
  { label: "Risk", value: "--", tone: "neutral" },
];

const riskTone = (riskAccounts: number): RadarStat["tone"] => (riskAccounts > 0 ? "amber" : "green");

const refreshIntervalMs = (refreshInterval: RefreshInterval) => {
  if (refreshInterval === "500ms") return 500;
  if (refreshInterval === "5s") return 5000;
  if (refreshInterval === "Manual") return Number.POSITIVE_INFINITY;
  return 1000;
};

const normalizeRisk = (risk: string): RiskLevel => {
  if (risk === "Liquidatable") return "Liquidatable";
  if (risk === "High Risk") return "High Risk";
  if (risk === "Warning") return "Warning";
  if (risk === "Healthy") return "Healthy";
  if (risk === "Invalid") return "Invalid";
  return "No Debt";
};

const normalizeAccount = (account: RiskAccount): RiskAccount => ({
  ...account,
  risk: normalizeRisk(account.risk),
  trend: account.trend?.length ? account.trend : [account.hf ?? 0],
  balances: account.balances ?? [],
});

const buildTopStats = (snapshot: ApiSnapshot): RadarStat[] => {
  const avgLatency =
    snapshot.accounts.length === 0
      ? 0
      : Math.round(snapshot.accounts.reduce((sum, item) => sum + item.latencyMs, 0) / snapshot.accounts.length);
  const totalUpdates = snapshot.stats.updatesProcessed + snapshot.stats.updatesSkipped;
  const processedRate = totalUpdates === 0 ? "0.00%" : `${((snapshot.stats.updatesProcessed / totalUpdates) * 100).toFixed(2)}%`;

  return [
    { label: "Slot", value: snapshot.stats.lastSlot.toLocaleString("en-US"), tone: "green" },
    { label: "Latency", value: `${avgLatency} ms`, tone: avgLatency > 500 ? "red" : "green" },
    { label: "Queue Depth", value: snapshot.queueDepth.toLocaleString("en-US"), tone: snapshot.queueDepth > 1000 ? "amber" : "blue" },
    { label: "Process Rate", value: processedRate, tone: "green" },
    { label: "Processed", value: snapshot.stats.updatesProcessed.toLocaleString("en-US"), tone: "green" },
    { label: "Risk", value: snapshot.stats.riskAccounts.toLocaleString("en-US"), tone: riskTone(snapshot.stats.riskAccounts) },
  ];
};

const buildSourceStatus = (snapshot: ApiSnapshot | null, status: StreamStatus): SourceStatus[] => {
  if (!snapshot) {
    if (!allowMockFallback) {
      return [
        { label: "Frontend Stream", value: status, kind: status === "connected" ? "success" : "muted" },
        { label: "RPC Endpoint", value: "unavailable", kind: "muted" },
        { label: "Account Type", value: "no live snapshot", kind: "muted" },
      ];
    }

    return [
      { label: "Frontend Stream", value: status === "mock" ? "mock fallback" : status, kind: "muted" },
      ...mockSourceStatus,
    ];
  }

  return [
    { label: "Frontend Stream", value: status, kind: status === "connected" ? "success" : "muted" },
    { label: "RPC Endpoint", value: snapshot.rpcEndpoint || snapshot.stats.lastRpcEndpoint, kind: "muted" },
    { label: "Account Type", value: snapshot.accountLabel, kind: "info" },
  ];
};

export function useRadarStream({ paused, refreshInterval }: UseRadarStreamOptions): RadarStreamState {
  const [snapshot, setSnapshot] = useState<ApiSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [alerts, setAlerts] = useState<ApiAlerts>({ telegramConfigured: false, telegramEnabled: false });
  const [history, setHistory] = useState<AccountHistoryState>({ status: "idle", account: null, points: [] });
  const latestSnapshotRef = useRef<ApiSnapshot | null>(null);
  const displayedSnapshotRef = useRef<ApiSnapshot | null>(null);
  const hasSnapshotRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const historyRequestRef = useRef<{ requestId: string; account: RiskAccount } | null>(null);
  const pendingManualRefreshRef = useRef(false);
  const lastAppliedAtRef = useRef(0);
  const pausedRef = useRef(paused);
  const refreshIntervalRef = useRef(refreshInterval);
  const url = import.meta.env.VITE_RADAR_WS_URL || fallbackUrl;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    refreshIntervalRef.current = refreshInterval;
  }, [refreshInterval]);

  const applySnapshot = useCallback((nextSnapshot: ApiSnapshot) => {
    displayedSnapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    if (nextSnapshot.alerts) setAlerts(nextSnapshot.alerts);
    lastAppliedAtRef.current = Date.now();
    pendingManualRefreshRef.current = false;
  }, []);

  const applyLatestSnapshot = useCallback(
    (force = false) => {
      const latestSnapshot = latestSnapshotRef.current;
      if (!latestSnapshot) return false;

      if (force) {
        applySnapshot(latestSnapshot);
        return true;
      }

      if (pausedRef.current || refreshIntervalRef.current === "Manual") return false;

      const now = Date.now();
      const minIntervalMs = refreshIntervalMs(refreshIntervalRef.current);
      if (!displayedSnapshotRef.current || now - lastAppliedAtRef.current >= minIntervalMs) {
        applySnapshot(latestSnapshot);
        return true;
      }

      return false;
    },
    [applySnapshot],
  );

  useEffect(() => {
    if (paused || refreshInterval === "Manual") return undefined;
    const timer = window.setInterval(() => {
      applyLatestSnapshot();
    }, 250);
    return () => window.clearInterval(timer);
  }, [applyLatestSnapshot, paused, refreshInterval]);

  const requestSnapshot = useCallback(() => {
    pendingManualRefreshRef.current = true;
    const appliedLocally = applyLatestSnapshot(true);
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return appliedLocally;
    socket.send(JSON.stringify({ type: "snapshot_request" }));
    return true;
  }, [applyLatestSnapshot]);

  const requestAccountHistory = useCallback((account: RiskAccount, limit = 120) => {
    const pubkey = account.accountFull;
    if (!pubkey) {
      setHistory({
        status: "error",
        account,
        points: [],
        error: "Full account address is unavailable for history lookup.",
      });
      return;
    }

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setHistory({
        status: "error",
        account,
        points: [],
        error: "Live stream is not connected.",
      });
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    historyRequestRef.current = { requestId, account };
    setHistory({ status: "loading", account, points: [] });
    socket.send(JSON.stringify({ type: "account_history", requestId, pubkey, limit }));
  }, []);

  const clearAccountHistory = useCallback(() => {
    historyRequestRef.current = null;
    setHistory({ status: "idle", account: null, points: [] });
  }, []);

  const setTelegramEnabled = useCallback((enabled: boolean) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    setAlerts((current) => ({
      telegramConfigured: current.telegramConfigured,
      telegramEnabled: current.telegramConfigured ? enabled : current.telegramEnabled,
    }));
    socket.send(JSON.stringify({ type: "alert_settings", telegramEnabled: enabled }));
    return true;
  }, []);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ApiSnapshot | ApiAccountHistory | ApiAlertSettings;
          if (message.type === "snapshot") {
            hasSnapshotRef.current = true;
            latestSnapshotRef.current = message;
            if (message.alerts) setAlerts(message.alerts);
            if (!displayedSnapshotRef.current || pendingManualRefreshRef.current) {
              applySnapshot(message);
            } else {
              applyLatestSnapshot();
            }
            setStatus("connected");
            return;
          }
          if (message.type === "account_history") {
            const pending = historyRequestRef.current;
            if (pending && pending.requestId === message.requestId) {
              setHistory({
                status: message.error ? "error" : "ready",
                account: pending.account,
                points: message.points ?? [],
                error: message.error,
              });
            }
            return;
          }
          if (message.type === "alert_settings") {
            setAlerts({
              telegramConfigured: message.telegramConfigured,
              telegramEnabled: message.telegramEnabled,
            });
          }
        } catch {
          setStatus("reconnecting");
        }
      };

      socket.onclose = () => {
        if (closed) return;
        if (socketRef.current === socket) socketRef.current = null;
        attempt += 1;
        setStatus(hasSnapshotRef.current ? "reconnecting" : allowMockFallback ? "mock" : "disconnected");
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 8000);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
    };
  }, [url]);

  return useMemo(() => {
    if (!snapshot) {
      if (!allowMockFallback) {
        return {
          accounts: [],
          topStats: emptyTopStats,
          sourceStatus: buildSourceStatus(null, status),
          status,
          snapshot,
          telegramConfigured: alerts.telegramConfigured,
          telegramEnabled: alerts.telegramEnabled,
          history,
          requestSnapshot,
          requestAccountHistory,
          setTelegramEnabled,
          clearAccountHistory,
        };
      }

      return {
        accounts: mockAccounts,
        topStats: mockTopStats,
        sourceStatus: buildSourceStatus(null, status),
        status,
        snapshot,
        telegramConfigured: alerts.telegramConfigured,
        telegramEnabled: alerts.telegramEnabled,
        history,
        requestSnapshot,
        requestAccountHistory,
        setTelegramEnabled,
        clearAccountHistory,
      };
    }

    return {
      accounts: snapshot.accounts.map(normalizeAccount),
      topStats: buildTopStats(snapshot),
      sourceStatus: buildSourceStatus(snapshot, status),
      status,
      snapshot,
      telegramConfigured: alerts.telegramConfigured,
      telegramEnabled: alerts.telegramEnabled,
      history,
      requestSnapshot,
      requestAccountHistory,
      setTelegramEnabled,
      clearAccountHistory,
    };
  }, [alerts.telegramConfigured, alerts.telegramEnabled, clearAccountHistory, history, requestAccountHistory, requestSnapshot, setTelegramEnabled, snapshot, status]);
}
