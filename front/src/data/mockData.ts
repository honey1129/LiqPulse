import {
  Activity,
  Bell,
  DatabaseZap,
  HeartPulse,
  LineChart,
  Network,
  Settings,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { NavItem, RadarStat, RiskAccount, SourceStatus, Threshold } from "../types";

export const programId = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";

export const navItems: NavItem[] = [
  { label: "Workbench", icon: Activity },
  { label: "Risk Accounts", icon: DatabaseZap },
  { label: "Alerts", icon: Bell },
  { label: "Positions", icon: Network },
  { label: "Accounts", icon: UserRound },
  { label: "Market Data", icon: LineChart },
  { label: "Health", icon: HeartPulse },
  { label: "RPC & Nodes", icon: WalletCards },
  { label: "Settings", icon: Settings },
];

export const topStats: RadarStat[] = [
  { label: "Slot", value: "255,842,731", tone: "green" },
  { label: "Latency", value: "38 ms", tone: "green" },
  { label: "Queue Depth", value: "42", tone: "blue" },
  { label: "Cache Hit Rate", value: "97.62%", tone: "green" },
  { label: "Processed", value: "1,248,319", tone: "green" },
  { label: "Skipped", value: "2,183", tone: "amber" },
];

export const sourceStatus: SourceStatus[] = [
  { label: "WebSocket", value: "programSubscribe", kind: "success" },
  { label: "RPC Endpoint", value: "mainnet.helius-rpc.com", kind: "muted" },
  { label: "Commitment", value: "processed", kind: "info" },
];

export const thresholds: Threshold[] = [
  { label: "HF < 1.0", value: "Liquidatable", tone: "red", status: "Liquidatable" },
  { label: "HF < 1.05", value: "High Risk", tone: "amber", status: "High Risk" },
  { label: "HF < 1.10", value: "Warning", tone: "yellow", status: "Warning" },
  { label: "HF >= 1.10", value: "Healthy", tone: "green", status: "Healthy" },
  { label: "No Debt / Invalid", value: "No Debt / Invalid", tone: "muted", status: "No Debt" },
];

const accounts = [
  ["7zKx...8QdM", "C7mN...a2F9", 245612.41, 265843.18, 0.9243, "Liquidatable"],
  ["9bRs...Dc9K", "3uYp...zL8e", 182331.09, 193245.77, 0.9426, "Liquidatable"],
  ["4mTy...Jp2L", "FhQ9...kN3v", 312907.23, 321176.88, 0.9743, "Liquidatable"],
  ["D1eX...Qw7R", "HbV2...yT6p", 158792.14, 163341.09, 0.9711, "Liquidatable"],
  ["3fPq...2bK9", "9kLm...hYd1", 276541.72, 284231.66, 0.9729, "Liquidatable"],
  ["BvZ8...t9Mn", "J8nK...pL2z", 446218.77, 454632.51, 0.9815, "Liquidatable"],
  ["9rNd...Xq3C", "Lq7W...mR4t", 201044.91, 207766.41, 0.9678, "Liquidatable"],
  ["2kLm...Hd2S", "T5xA...yP8h", 133881.05, 139887.56, 0.9571, "Liquidatable"],
  ["JtHf...9UvY", "W3pQ...cR1m", 245611.37, 255472.11, 0.9590, "Liquidatable"],
  ["7qMa...n68l", "Yk9d...f67s", 189332.44, 198576.16, 0.9534, "Liquidatable"],
  ["6cRf...Kp8L", "NszT...bM6v", 312777.12, 326151.41, 0.9589, "Liquidatable"],
  ["5nZa...Qd7H", "P8wR...kJ3n", 501233.48, 524103.26, 0.9563, "Liquidatable"],
  ["4dNx...Lp3Q", "A1bC...tY9r", 215667.91, 225688.34, 0.9556, "Liquidatable"],
  ["8sWu...Zx6T", "R7vB...qD2n", 171224.77, 179559.12, 0.9536, "Liquidatable"],
  ["3uVb...6m9P", "E2hJ...nK4w", 164998.22, 173098.88, 0.9521, "Liquidatable"],
  ["HdSk...mT2L", "D9cK...uR6p", 287441.65, 297884.70, 0.9649, "Liquidatable"],
  ["Px9R...wQf3", "Z3tM...vL8b", 258771.31, 268403.89, 0.9638, "Liquidatable"],
  ["Y6nQ...Jk7N", "G8pK...aM5z", 233099.19, 242153.37, 0.9636, "Liquidatable"],
  ["Lq2T...uP6D", "B5nV...rH1k", 612331.44, 624890.12, 0.9809, "Liquidatable"],
  ["Gd7J...cL8H", "K1rD...zS3q", 348551.28, 355772.91, 0.9797, "Liquidatable"],
  ["7hNc...t84Y", "M2yH...pT6f", 198311.72, 205114.55, 0.9668, "Liquidatable"],
  ["R3kV...Qv2Z", "U9pL...tN8c", 156889.43, 162712.69, 0.9632, "Liquidatable"],
  ["K9xP...mD6A", "Q4d6...vJ2t", 174221.55, 181179.21, 0.9616, "Liquidatable"],
  ["T8cH...p29S", "S7nR...bK5m", 142330.88, 148394.22, 0.9592, "Liquidatable"],
  ["J4vN...kP1R", "H3sG...uY7q", 502118.99, 489102.33, 1.0266, "High Risk"],
  ["W2pL...Qn7B", "F6tR...aK9d", 621445.32, 584110.19, 1.0640, "Warning"],
  ["N7dX...bL3Q", "P1vS...rT5z", 783221.11, 689330.46, 1.1362, "Healthy"],
  ["Ay8Z...vQ6T", "L8kD...mH1p", 1204869.44, 0, null, "No Debt"],
] as const;

export const riskAccounts: RiskAccount[] = accounts.map((item, index) => {
  const risk = item[5];
  const seed = index + 4;
  const trend = Array.from({ length: 14 }, (_, point) => {
    const drift = risk === "Healthy" ? point * 0.7 : risk === "No Debt" ? 0 : -point * 0.18;
    return 42 + Math.sin((point + seed) * 1.1) * 5 + Math.cos((point + seed) * 0.43) * 3 + drift;
  });

  return {
    rank: index + 1,
    account: item[0],
    wallet: item[1],
    protocol: "marginfi v2",
    collateralUsd: item[2],
    debtUsd: item[3],
    hf: item[4],
    risk,
    updatedSlot: 255842728 + (index % 4),
    latencyMs: 34 + ((index * 7) % 8),
    trend,
  };
});
