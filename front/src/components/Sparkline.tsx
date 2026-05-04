import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { RiskLevel } from "../types";

type SparklineProps = {
  data: number[];
  risk: RiskLevel;
};

const strokeByRisk: Record<RiskLevel, string> = {
  Liquidatable: "#ff3b3b",
  "High Risk": "#f59e0b",
  Warning: "#facc15",
  Healthy: "#31d472",
  "No Debt": "#94a3b8",
  Invalid: "#94a3b8",
};

export function Sparkline({ data, risk }: SparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));
  return (
    <div className="h-7 w-[70px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          <YAxis domain={["dataMin - 4", "dataMax + 4"]} hide />
          <Line type="monotone" dataKey="value" stroke={strokeByRisk[risk]} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
