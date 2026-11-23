/** الموارد البشرية: the sections (same as the drop-down in the main menu) and the pages of the open one. */
import { lazy, Suspense } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { IdCard } from "lucide-react";
import { PageHeader } from "@/shell/PageHeader";
import { Skeleton } from "@/ui";
import { cn } from "@/lib/cn";
import { AreaGate } from "../useAccess";
import { useHrSections, type HrPageDef, type HrSection } from "./sections";

const Dashboard = lazy(() => import("./Dashboard"));
const Reports = lazy(() => import("./Reports"));
const Employees = lazy(() => import("./Employees"));
const EmployeeFile = lazy(() => import("./EmployeeFile"));
const Contracts = lazy(() => import("./Contracts"));
const Payslips = lazy(() => import("./Payslips"));
const Org = lazy(() => import("./Org"));
const Jobs = lazy(() => import("./Jobs"));
const Recruit = lazy(() => import("./Recruit"));
const Onboarding = lazy(() => import("./Onboarding"));
const Requests = lazy(() => import("./Requests"));
const Evaluations = lazy(() => import("./Evaluations"));
const Training = lazy(() => import("./Training"));
const Discipline = lazy(() => import("./Discipline"));
const Exit = lazy(() => import("./Exit"));
const Settings = lazy(() => import("./Settings"));
const Fields = lazy(() => import("./Fields"));
const Schedule = lazy(() => import("@/modules/staff/SchedulePage"));
const Attendance = lazy(() => import("./AttendanceTab"));

function HrNav({ groups, current }: { groups: HrSection[]; current: HrSection }) {
  return (
    <div className="grid gap-3">
      <nav aria-label="أقسام الموارد البشرية" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {groups.map((g) => {
          const on = g.id === current.id;
          return (
            <Link key={g.id} to={g.pages[0].to} aria-current={on ? "true" : undefined}
              className={cn("flex min-w-0 flex-1 basis-[30%] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12.5px] font-semibold transition-colors sm:basis-auto sm:text-[14px] [&_svg]:size-[17px] [&_svg]:shrink-0",
                on ? "bg-surface text-ink shadow-sf-sm ring-1 ring-line [&_svg]:text-brass-text" : "text-muted hover:text-ink")}>
              <g.Icon /><span className="truncate">{g.label}</span>
            </Link>
          );
        })}
      </nav>
      {current.pages.length > 1 ? (
        <nav aria-label={current.label} className="flex flex-wrap gap-2">
          {current.pages.map((p) => (
            <NavLink key={p.to} to={p.to} end={p.end}
              className={({ isActive }) => cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors sm:h-10 sm:px-4 sm:text-[14px] [&_svg]:size-4",
                isActive ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
              {p.icon}{p.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export default function HrPage() {
  const { pathname } = useLocation();
  const groups = useHrSections();
  const first = groups[0]?.pages[0]?.to ?? null;
  const gate = (area: string, el: JSX.Element) => <AreaGate id={area} fallback={first}>{el}</AreaGate>;
  const at = (p: HrPageDef) => (p.end ? pathname.replace(/\/$/, "") === p.to : pathname === p.to || pathname.startsWith(`${p.to}/`) || (p.to === "/hr/employees" && pathname.startsWith("/hr/e/")));
  if (!groups.length) return <AreaGate id="hr.summary">{null}</AreaGate>;
  const current = groups.find((g) => g.pages.some(at)) ?? groups[0];
  return (
    <div className="grid gap-5">
      <PageHeader icon={<IdCard />} title="الموارد البشرية" />
      <HrNav groups={groups} current={current} />
      <Suspense fallback={<Skeleton className="h-96" rounded="rounded-[20px]" />}>
        <Routes>
          <Route index element={gate("hr.summary", <Dashboard />)} />
          <Route path="reports" element={gate("hr.summary", <Reports />)} />
          <Route path="employees" element={gate("hr.employees", <Employees />)} />
          <Route path="e/:memberId/*" element={gate("hr.employees", <EmployeeFile />)} />
          <Route path="contracts" element={gate("hr.contracts", <Contracts />)} />
          <Route path="payslips" element={gate("hr.payslips", <Payslips />)} />
          <Route path="org" element={gate("hr.org", <Org />)} />
          <Route path="jobs" element={gate("hr.org", <Jobs />)} />
          <Route path="recruit" element={gate("hr.recruit", <Recruit />)} />
          <Route path="onboarding" element={gate("hr.onboard", <Onboarding />)} />
          <Route path="schedule" element={gate("hr.schedule", <Schedule />)} />
          <Route path="attendance" element={gate("hr.attendance", <Attendance />)} />
          <Route path="requests" element={gate("hr.requests", <Requests />)} />
          <Route path="evaluations" element={gate("hr.evaluations", <Evaluations />)} />
          <Route path="training" element={gate("hr.training", <Training />)} />
          <Route path="discipline" element={gate("hr.discipline", <Discipline />)} />
          <Route path="exit" element={gate("hr.exit", <Exit />)} />
          <Route path="settings" element={gate("hr.settings", <Settings />)} />
          <Route path="fields" element={gate("hr.settings", <Fields />)} />
          <Route path="*" element={<Navigate to={first ?? "/hr"} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
