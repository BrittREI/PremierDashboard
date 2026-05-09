import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Activity,
  Users,
  Target,
  FileText,
  ArrowRight,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useAllOpportunities } from "@/hooks/useGhlData";
import { formatCurrency, formatDate } from "@/lib/utils";
import { USERS } from "@/types/ghl";

const QUICK_LINKS = [
  { to: "/kpi", label: "KPI Report", icon: BarChart3, color: "bg-blue-50 text-blue-600" },
  { to: "/pipeline", label: "Pipeline Health", icon: Activity, color: "bg-purple-50 text-purple-600" },
  { to: "/team", label: "Team Performance", icon: Users, color: "bg-emerald-50 text-emerald-600" },
  { to: "/sources", label: "Lead Sources", icon: Target, color: "bg-amber-50 text-amber-600" },
  { to: "/deals", label: "Deal Tracker", icon: FileText, color: "bg-rose-50 text-rose-600" },
];

export function Overview() {
  const { leadManagement, disposition, all, isLoading } =
    useAllOpportunities();

  const stats = useMemo(() => {
    const closedWon = disposition.filter(
      (d) => d.pipelineStageId === "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef"
    );
    const revenue = closedWon.reduce((s, d) => s + d.monetaryValue, 0);
    const pipelineValue = disposition
      .filter(
        (d) =>
          d.pipelineStageId !== "3e83fed8-a5cb-4b27-b1f9-4277cc7642ef" &&
          d.pipelineStageId !== "a8f59eda-3bac-4b15-8441-5ed852f965f0" &&
          d.status === "open"
      )
      .reduce((s, d) => s + d.monetaryValue, 0);

    return {
      totalLeads: leadManagement.length,
      totalDeals: all.length,
      revenue,
      pipelineValue,
    };
  }, [leadManagement, disposition, all]);

  // Recent deals (last 5 by creation date)
  const recentDeals = useMemo(
    () =>
      [...all]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5),
    [all]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Premier Path Properties
        </h1>
        <p className="text-slate-500 mt-1">Dashboard overview — {formatDate(new Date())}</p>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Leads"
          value={stats.totalLeads}
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard
          title="Total Deals"
          value={stats.totalDeals}
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="Revenue (Won)"
          value={formatCurrency(stats.revenue)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(stats.pipelineValue)}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {QUICK_LINKS.map(({ to, label, icon: Icon, color }) => (
          <Link
            key={to}
            to={to}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className={`p-3 rounded-lg w-fit ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="mt-3 font-medium text-slate-800 group-hover:text-blue-600 transition-colors">
              {label}
            </p>
            <ArrowRight className="w-4 h-4 mt-2 text-slate-400 group-hover:text-blue-500 transition-colors" />
          </Link>
        ))}
      </div>

      {/* Recent deals */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Recent Activity
          </h3>
          <Link
            to="/deals"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-slate-500 text-left">
                <th className="px-6 py-3 font-medium">Deal</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium text-right">Value</th>
                <th className="px-6 py-3 font-medium">Assigned To</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentDeals.map((opp) => (
                <tr
                  key={opp.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-6 py-3 font-medium text-slate-900 max-w-[250px] truncate">
                    {opp.name || "—"}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {opp.contact?.name || "—"}
                  </td>
                  <td className="px-6 py-3 text-right font-medium">
                    {opp.monetaryValue > 0
                      ? formatCurrency(opp.monetaryValue)
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {opp.assignedTo
                      ? USERS[opp.assignedTo] ?? "Unknown"
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(opp.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
