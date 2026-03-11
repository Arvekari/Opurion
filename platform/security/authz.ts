export type PlatformRole = 'global_admin' | 'developer_admin' | 'user';

export function normalizePlatformRole(role: string | undefined, isAdmin: boolean): PlatformRole {
  if (role === 'global_admin' || role === 'developer_admin' || role === 'user') {
    if (isAdmin && role === 'user') {
      return 'global_admin';
    }

    return role;
  }

  return isAdmin ? 'global_admin' : 'user';
}

export function canAccessRole(role: PlatformRole | undefined, requiredRole: PlatformRole): boolean {
  if (!role) {
    return false;
  }

  const rank: Record<PlatformRole, number> = {
    user: 0,
    developer_admin: 1,
    global_admin: 2,
  };

  return rank[role] >= rank[requiredRole];
}
