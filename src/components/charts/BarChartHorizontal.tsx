import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface BarChartHorizontalProps {
  data: Array<{ name: string; value: number; [key: string]: unknown }>;
  isCurrency?: boolean;
  color?: string;
  barKey?: string;
}

export function BarChartHorizontal({
  data,
  isCurrency = false,
  color = "#3b82f6",
  barKey = "value",
}: BarChartHorizontalProps) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#475569" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#475569" }}
            tickFormatter={(v) =>
              isCurrency ? formatCurrency(v) : formatNumber(v)
            }
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [
              isCurrency ? formatCurrency(value) : formatNumber(value),
              "",
            ]}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Bar dataKey={barKey} fill={color} radius={[6, 6, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
