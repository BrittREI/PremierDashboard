import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#06b6d4",
];

interface DonutChartProps {
  data: Array<{ name: string; value: number }>;
  isCurrency?: boolean;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({
  data,
  isCurrency = false,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  return (
    <div className="w-full h-72 relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_entry, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [
              isCurrency ? formatCurrency(value) : value,
              "",
            ]}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px" }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginBottom: 36 }}>
          <span className="text-2xl font-bold text-slate-900">
            {centerValue}
          </span>
          <span className="text-xs text-slate-500">{centerLabel}</span>
        </div>
      )}
    </div>
  );
}
