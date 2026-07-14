import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import {
  House, Compass, ChatCircleDots, GraduationCap,
  GitPullRequest, ChartBar, ListChecks, BugBeetle, Gear,
  BookOpenText, Question, ShieldCheck, Heartbeat, Eye, Code,
  Star, Key,
} from '@phosphor-icons/react'

const portalItems = [
  { to: '/dev-space',      label: 'Dev Space',     Icon: Code,        roles: ['developer', 'tester', 'owner', 'ceo', 'cto'] },
  { to: '/executive',      label: 'Executive',     Icon: ChartBar,    roles: ['owner', 'ceo', 'cto'] },
  { to: '/senior-space',   label: 'Senior',        Icon: ShieldCheck, roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/onboarding-hub', label: 'Onboarding',    Icon: GraduationCap, roles: ['new_dev', 'member'] },
]

const toolItems = [
  { to: '/dashboard',   label: 'Dashboard',    Icon: House,          roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/my-progress', label: 'My Progress',  Icon: Star,           roles: ['new_dev', 'member'] },
  { to: '/explore',     label: 'Explore',      Icon: Compass,        roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/ask',         label: 'Ask Codebase', Icon: ChatCircleDots, roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/learn',       label: 'Learn',        Icon: GraduationCap,  roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/tasks',       label: 'Tasks',        Icon: ListChecks,     roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/first-issue',  label: 'First Issue', Icon: BugBeetle,      roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/pr-describe',  label: 'PR Describe', Icon: GitPullRequest, roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
]

const mgmtItems = [
  { to: '/reviews',     label: 'Reviews',      Icon: Eye,           roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/code-health', label:'Code Health',   Icon: Heartbeat,     roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/api-keys',    label: 'API Keys',     Icon: Key,           roles: ['senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
  { to: '/admin',       label: 'Admin',        Icon: ShieldCheck,   roles: ['owner', 'ceo', 'cto'] },
  { to: '/settings',    label: 'Settings',     Icon: Gear,          roles: ['new_dev', 'member', 'senior_dev', 'developer', 'tester', 'owner', 'ceo', 'cto', 'senior'] },
]

const bottomItems = [
  { to: '/docs',    label: 'Docs',     Icon: BookOpenText },
  { to: '/support', label: 'Support',  Icon: Question },
]

function NavGroup({ items }: { items: { to: string; label: string; Icon: any; roles?: string[] }[] }) {
  const { role } = useAuth()
  const visible = items.filter((i) => !i.roles || i.roles.includes(role || ''))
  if (visible.length === 0) return null
  return (
    <>
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-150',
              isActive
                ? 'text-text-primary font-medium'
                : 'text-text-tertiary hover:text-text-secondary'
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent-from" />
              )}
              <item.Icon
                size={16}
                weight={isActive ? 'fill' : 'regular'}
                className={cn('shrink-0', isActive ? 'text-accent-from' : 'text-text-muted')}
              />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  )
}

export default function Sidebar() {
  const { role } = useAuth()

  return (
    <aside
      aria-label="Primary navigation"
      className="w-[220px] min-h-screen bg-bg-primary border-r border-border/50 flex flex-col shrink-0"
    >
      {/* Brand */}
      <div className="px-4 pt-5 pb-4">
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
            <span className="text-[10px] font-bold text-[#09090B] font-display">CF</span>
          </div>
          <span className="font-display text-sm font-semibold text-text-primary tracking-tight">
            CodeFlow
          </span>
        </NavLink>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* Portals */}
        <div>
          <div className="px-2.5 pb-1">
            <span className="text-[10px] font-medium tracking-wider text-text-muted/40 uppercase">Portals</span>
          </div>
          <div className="space-y-0.5">
            <NavGroup items={portalItems} />
          </div>
        </div>

        {/* Tools */}
        <div>
          <div className="px-2.5 pb-1">
            <span className="text-[10px] font-medium tracking-wider text-text-muted/40 uppercase">Workspace</span>
          </div>
          <div className="space-y-0.5">
            <NavGroup items={toolItems} />
          </div>
        </div>

        {/* Management */}
        {(role === 'senior' || role === 'senior_dev' || role === 'developer' || role === 'tester' || role === 'owner' || role === 'ceo' || role === 'cto') && (
          <div>
            <div className="px-2.5 pb-1">
              <span className="text-[10px] font-medium tracking-wider text-text-muted/40 uppercase">Management</span>
            </div>
            <div className="space-y-0.5">
              <NavGroup items={mgmtItems} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="px-2 py-3 border-t border-border/40 mt-2">
        <div className="space-y-0.5">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-150',
                  isActive
                    ? 'text-text-primary font-medium'
                    : 'text-text-tertiary hover:text-text-secondary'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent-from" />
                  )}
                  <item.Icon
                    size={16}
                    weight={isActive ? 'fill' : 'regular'}
                    className={cn('shrink-0', isActive ? 'text-accent-from' : 'text-text-muted')}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  )
}
