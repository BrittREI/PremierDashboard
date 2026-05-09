import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StageCount } from "@/types/ghl";

const COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
];

interface FunnelChartProps {
  data: StageCount[];
  showValue?: boolean;
}

export function FunnelChart({ data, showValue = false }: FunnelChartProps) {
  const sorted = [...data].sort((a, b) => a.position - b.position);

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 30 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="stageName"
            width={130}
            tick={{ fontSize: 13, fill: "#475569" }}
          />
          <Tooltip
            formatter={(value: number, _name: string, props: { payload: StageCount }) => {
              const row = props.payload;
              return [
                showValue
                  ? `${formatNumber(value)} deals — ${formatCurrency(row.totalValue)}`
                  : `${formatNumber(value)} deals`,
                "",
              ];
            }}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={28}>
            {sorted.map((_entry, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
