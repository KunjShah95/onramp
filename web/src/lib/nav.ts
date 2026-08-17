import {
  House, Compass, ChatCircleDots, GraduationCap,
  GitPullRequest, ChartBar, ListChecks, BugBeetle, Gear,
  BookOpenText, Question, ShieldCheck, Heartbeat, Eye, Code,
  Star, Key, Rocket, FileCode, Bell, Flag, Storefront, Warning, Robot,
  Users, TrendUp,
  type Icon,
} from '@phosphor-icons/react'

export interface NavItem {
  to: string
  label: string
  Icon: Icon
  roles?: string[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/** Role-based portal pages — the "hub" for each persona. */
export const portalItems: NavItem[] = [
  { to: '/dev-space',      label: 'Dev Space',     Icon: Code,        roles: ['developer', 'tester', 'senior_dev', 'admin', 'ceo', 'cto'] },
  { to: '/executive',      label: 'Executive',     Icon: ChartBar,    roles: ['admin', 'ceo', 'cto'] },
  { to: '/senior-space',   label: 'Senior',        Icon: ShieldCheck, roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/onboarding-hub', label: 'Onboarding',    Icon: GraduationCap, roles: ['junior_dev', 'member'] },
]

/** Daily workspace — things you open every day. */
export const workspaceItems: NavItem[] = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: House,          roles: ['senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/explore',     label: 'Explore',     Icon: Compass,        roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/ask',         label: 'Ask Codebase', Icon: ChatCircleDots, roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/learn',       label: 'Learn',        Icon: GraduationCap, roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/tasks',       label: 'Tasks',        Icon: ListChecks,    roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/notifications', label: 'Notifications', Icon: Bell,       roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior', 'hr'] },
]

/** Build — focused coding & delivery tools. */
export const buildItems: NavItem[] = [
  { to: '/my-progress',   label: 'My Progress',   Icon: Star,         roles: ['junior_dev', 'member'] },
  { to: '/first-issue',   label: 'First Issue',   Icon: BugBeetle,    roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/pr-describe',   label: 'PR Describe',   Icon: GitPullRequest, roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/autonomous',    label: 'Auto Coding',   Icon: Robot,        roles: ['senior_dev', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/onboarding-plan', label: 'Onboarding Plan', Icon: Rocket,   roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/wiki',          label: 'Wiki',          Icon: FileCode,     roles: ['junior_dev', 'member', 'senior_dev', 'developer', 'tester', 'admin', 'ceo', 'cto', 'senior'] },
  { to: '/marketplace',   label: 'Marketplace',   Icon: Storefront,   roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
]

/** HR — people & team operations. */
export const hrItems: NavItem[] = [
  { to: '/hr/people',    label: 'People',       Icon: Users,    roles: ['hr'] },
  { to: '/hr-dashboard', label: 'HR Dashboard', Icon: ChartBar, roles: ['hr'] },
]

/** Manage — reviews, quality and administration. */
export const manageItems: NavItem[] = [
  { to: '/ramp',             label: 'Ramp',            Icon: TrendUp,     roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto', 'hr'] },
  { to: '/reviews',          label: 'Reviews',         Icon: Eye,         roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/code-health',      label: 'Code Health',     Icon: Heartbeat,   roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/drift',            label: 'Drift Detect',    Icon: Warning,     roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/developer-portal', label: 'Developer Portal', Icon: Code,       roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/api-keys',         label: 'API Keys',        Icon: Key,         roles: ['senior_dev', 'senior', 'admin', 'ceo', 'cto'] },
  { to: '/admin',            label: 'Admin',           Icon: ShieldCheck, roles: ['admin', 'ceo', 'cto'] },
  { to: '/admin/feature-flags', label: 'Feature Flags', Icon: Flag,       roles: ['admin', 'ceo', 'cto'] },
]

/** System links (bottom section). */
export const bottomItems: NavItem[] = [
  { to: '/settings', label: 'Settings', Icon: Gear },
  { to: '/docs',     label: 'Docs',     Icon: BookOpenText },
  { to: '/support',  label: 'Support',  Icon: Question },
]

/** All role-filtered sections, in sidebar order. */
export const navSections: NavSection[] = [
  { title: 'Portals', items: portalItems },
  { title: 'Workspace', items: workspaceItems },
  { title: 'Build', items: buildItems },
  { title: 'HR', items: hrItems },
  { title: 'Manage', items: manageItems },
]
