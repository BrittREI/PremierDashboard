import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Activity,
  Users,
  Target,
  FileText,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Home },
  { to: "/kpi", label: "KPI Report", icon: BarChart3 },
  { to: "/pipeline", label: "Pipeline Health", icon: Activity },
  { to: "/team", label: "Team Performance", icon: Users },
  { to: "/sources", label: "Lead Sources", icon: Target },
  { to: "/deals", label: "Deal Tracker", icon: FileText },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-lg font-bold tracking-tight">Premier Path</h1>
        <p className="text-xs text-slate-400 mt-1">GHL Dashboards</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">Charlotte, NC</p>
        <p className="text-xs text-slate-500">Premier Path Properties</p>
      </div>
    </aside>
  );
}
