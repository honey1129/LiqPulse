import { useEffect, useMemo, useRef, useState } from "react";
import { riskAccounts as mockAccounts, sourceStatus as mockSourceStatus, topStats as mockTopStats } from "../data/mockData";
import type { RadarStat, RiskAccount, RiskLevel, SourceStatus, StreamStatus } from "../types";

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
  stats: ApiStats;
  accounts: RiskAccount[];
};

type RadarStreamState = {
  accounts: RiskAccount[];
  topStats: RadarStat[];
  sourceStatus: SourceStatus[];
  status: StreamStatus;
  snapshot: ApiSnapshot | null;
};

const fallbackUrl = "ws://127.0.0.1:8765";

const riskTone = (riskAccounts: number): RadarStat["tone"] => (riskAccounts > 0 ? "amber" : "green");

const normalizeRisk = (risk: string): RiskLevel => {
  if (risk === "Liquidatable") return "Liquidatable";
  if (risk === "High Risk") return "High Risk";
  if (risk === "Warning") return "Warning";
  if (risk === "Healthy") return "Healthy";
  return "No Debt";
};

const normalizeAccount = (account: RiskAccount): RiskAccount => ({
  ...account,
  risk: normalizeRisk(account.risk),
  trend: account.trend?.length ? account.trend : [account.hf ?? 0],
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

export function useRadarStream(): RadarStreamState {
  const [snapshot, setSnapshot] = useState<ApiSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const hasSnapshotRef = useRef(false);
  const url = import.meta.env.VITE_RADAR_WS_URL || fallbackUrl;

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(url);

      socket.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const nextSnapshot = JSON.parse(event.data) as ApiSnapshot;
          if (nextSnapshot.type === "snapshot") {
            hasSnapshotRef.current = true;
            setSnapshot(nextSnapshot);
            setStatus("connected");
          }
        } catch {
          setStatus("reconnecting");
        }
      };

      socket.onclose = () => {
        if (closed) return;
        attempt += 1;
        setStatus(hasSnapshotRef.current ? "reconnecting" : "mock");
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
      socket?.close();
    };
  }, [url]);

  return useMemo(() => {
    if (!snapshot) {
      return {
        accounts: mockAccounts,
        topStats: mockTopStats,
        sourceStatus: buildSourceStatus(null, status),
        status,
        snapshot,
      };
    }

    return {
      accounts: snapshot.accounts.map(normalizeAccount),
      topStats: buildTopStats(snapshot),
      sourceStatus: buildSourceStatus(snapshot, status),
      status,
      snapshot,
    };
  }, [snapshot, status]);
}
