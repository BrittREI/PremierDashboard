import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface StackedBarChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  bars: Array<{ key: string; color: string; label: string }>;
  isCurrency?: boolean;
  height?: number;
  stacked?: boolean;
}

export function StackedBarChart({
  data,
  xKey,
  bars,
  isCurrency = false,
  height = 250,
  stacked = false,
}: StackedBarChartProps) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 10, right: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "#475569" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#475569" }}
            tickFormatter={(v) =>
              isCurrency ? formatCurrency(v) : formatNumber(v)
            }
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              isCurrency ? formatCurrency(value) : formatNumber(value),
              name,
            ]}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          />
          {bars.map((bar) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.label}
              fill={bar.color}
              stackId={stacked ? "stack" : undefined}
              radius={stacked ? undefined : [4, 4, 0, 0]}
              barSize={stacked ? undefined : 32}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
