import { PAYROLL_TAB_COPY } from "@/lib/copy/business-ui-copy"

export type PayrollWorkspaceTab = "overview" | "people" | "runs" | "schedules" | "settings"

export interface PayrollWorkspaceAction {
  label: string
  href: string
  kind: "primary" | "secondary"
}

export interface PayrollWorkspaceTabConfig {
  id: PayrollWorkspaceTab
  href: string
  label: string
  description: string
  primaryAction?: PayrollWorkspaceAction
  secondaryActions?: PayrollWorkspaceAction[]
}

export interface PayrollListViewState {
  query: string
  filter: string
}

export const PAYROLL_WORKSPACE_TABS: PayrollWorkspaceTabConfig[] = [
  {
    id: "overview",
    href: "/payroll",
    label: "Overview",
    description: PAYROLL_TAB_COPY.overview,
    primaryAction: { label: "Run payroll", href: "/payroll/runs/new", kind: "primary" },
    secondaryActions: [
      { label: "Add person", href: "/payroll/people/new", kind: "secondary" },
      { label: "Create schedule", href: "/payroll/schedules/new", kind: "secondary" },
      { label: "Import people", href: "/payroll/people/import", kind: "secondary" },
    ],
  },
  {
    id: "people",
    href: "/payroll/people",
    label: "People",
    description: PAYROLL_TAB_COPY.people,
    primaryAction: {
      label: "Add person",
      href: "/payroll/people/new?returnTo=/payroll/people",
      kind: "primary",
    },
    secondaryActions: [
      { label: "Import people", href: "/payroll/people/import", kind: "secondary" },
    ],
  },
  {
    id: "runs",
    href: "/payroll/runs",
    label: "Runs",
    description: PAYROLL_TAB_COPY.runs,
    primaryAction: { label: "Run payroll", href: "/payroll/runs/new", kind: "primary" },
  },
  {
    id: "schedules",
    href: "/payroll/schedules",
    label: "Schedules",
    description: PAYROLL_TAB_COPY.schedules,
    primaryAction: {
      label: "Create schedule",
      href: "/payroll/schedules/new",
      kind: "primary",
    },
  },
  {
    id: "settings",
    href: "/payroll/settings",
    label: "Settings",
    description: PAYROLL_TAB_COPY.settings,
  },
]

export function payrollWorkspaceTabForPath(pathname: string): PayrollWorkspaceTabConfig | null {
  return PAYROLL_WORKSPACE_TABS.find((tab) => tab.href === pathname) ?? null
}
