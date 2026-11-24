/**
 * Role vocabulary and role-derived policy — deliberately NOT in AuthContext.
 *
 * WHY THIS FILE EXISTS (do not merge it back):
 * `AuthContext.tsx` holds the React context. Vite's React Fast Refresh can only
 * hot-update a module whose runtime exports are *all* components/hooks. The
 * moment a context module also exports a plain array or a plain function, the
 * plugin gives up and **invalidates** the module instead — which mints a brand
 * new context object. Every consumer that captured the previous one then throws
 * "useAuth must be used within an AuthProvider", and because the provider sits
 * near the root of the tree, one edit to a role policy white-screens the entire
 * app in dev. Type-only exports are erased at compile time and are safe to
 * re-export from the context; runtime values are not.
 *
 * Rule of thumb: data and pure policy live here or in `lib/`; the context file
 * exports only its Provider and its hooks.
 */

export type TeamRole =
  | 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester'
  | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr'

/** Roles allowed to create & manage team API keys (Settings + Developer Portal). */
export const KEY_MANAGER_ROLES: TeamRole[] = [
  'ceo', 'cto', 'admin', 'senior', 'senior_dev', 'developer', 'tester',
]

/** Role-appropriate landing page after login/register. */
export function homeForRole(role: TeamRole | null | undefined): string {
  if (role === 'hr') return '/hr/people'
  if (role === 'junior_dev' || role === 'member') return '/my-progress'
  return '/dashboard'
}
