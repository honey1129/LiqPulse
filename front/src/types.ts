import type { LucideIcon } from "lucide-react";

export type RiskLevel = "Liquidatable" | "High Risk" | "Warning" | "Healthy" | "No Debt" | "Invalid";
export type ThemeMode = "dark" | "light";
export type StreamStatus = "connecting" | "connected" | "reconnecting" | "mock" | "disconnected";
export type RiskFilter = "All Risks" | RiskLevel;
export type SortOption = "HF ASC, Size DESC" | "HF DESC" | "Size DESC" | "Slot DESC" | "Latency ASC";
export type RefreshInterval = "500ms" | "1s" | "5s" | "Manual";

export type NavItem = {
  label: string;
  icon: LucideIcon;
};

export type RadarStat = {
  label: string;
  value: string;
  tone?: "green" | "blue" | "amber" | "red" | "neutral";
};

export type RiskAccount = {
  rank: number;
  account: string;
  accountFull?: string;
  wallet: string;
  walletFull?: string;
  protocol: string;
  collateralUsd: number;
  debtUsd: number;
  hf: number | null;
  risk: RiskLevel;
  updatedSlot: number;
  latencyMs: number;
  trend: number[];
  rpcEndpoint?: string;
  balances?: AccountBalance[];
};

export type AccountBalance = {
  bankPk: string;
  assetShares: string;
  liabilityShares: string;
  lastUpdate: number;
};

export type Threshold = {
  label: string;
  value: string;
  tone: "red" | "amber" | "yellow" | "green" | "muted";
  status: string;
};

export type SourceStatus = {
  label: string;
  value: string;
  kind?: "success" | "info" | "muted";
};

export type AccountHistoryPoint = {
  slot: number;
  recordedAtMs: number;
  collateralUsd: number;
  debtUsd: number;
  exposureUsd: number;
  hf: number | null;
  risk: RiskLevel;
  rpcEndpoint?: string;
};

export type AccountHistoryState = {
  status: "idle" | "loading" | "ready" | "error";
  account: RiskAccount | null;
  points: AccountHistoryPoint[];
  error?: string;
};
