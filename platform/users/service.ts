import type { PlatformRole } from '~/platform/security/authz';

export type PlatformUserSummary = {
  id: string;
  username: string;
  role: PlatformRole;
};
