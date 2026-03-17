import type { TabType } from './types';
import { User, Users, Settings, Bell, Star, Database, Cloud, Laptop, Github, Wrench, List, Globe } from 'lucide-react';

// GitLab icon component
const GitLabIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path
      fill="currentColor"
      d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
    />
  </svg>
);

// cPanel icon component
const CPanelIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path
      fill="currentColor"
      d="M4 4h16v4H4zm0 6h10v4H4zm0 6h16v4H4z"
    />
  </svg>
);

// Supabase icon component
const SupabaseIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path
      fill="currentColor"
      d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 0 0 .836 1.659H12V21.6a.396.396 0 0 0 .716.233l9.081-12.261.401-.562a1.04 1.04 0 0 0-.836-1.656z"
    />
  </svg>
);

export const TAB_ICONS: Record<TabType, React.ComponentType<{ className?: string }>> = {
  profile: User,
  'user-management': Users,
  settings: Settings,
  notifications: Bell,
  features: Star,
  data: Database,
  'cloud-providers': Cloud,
  'local-providers': Laptop,
  github: Github,
  gitlab: () => <GitLabIcon />,
  netlify: Globe,
  vercel: () => <CPanelIcon />,
  supabase: () => <SupabaseIcon />,
  'event-logs': List,
  debug: Wrench,
  mcp: Wrench,
  n8n: Wrench,
  openclaw: Wrench,
  'http-deploy': Wrench,
  'system-prompt': Wrench,
};

export const TAB_LABELS: Record<TabType, string> = {
  profile: 'Profile',
  'user-management': 'User Management',
  settings: 'Settings',
  notifications: 'Notifications',
  features: 'Features',
  data: 'Data Management',
  'cloud-providers': 'Cloud Providers',
  'local-providers': 'Local Providers',
  github: 'GitHub',
  gitlab: 'GitLab',
  netlify: 'Plesk',
  vercel: 'cPanel',
  supabase: 'Supabase / PostgreSQL',
  'event-logs': 'Event Logs',
  debug: 'Debug',
  mcp: 'MCP Servers',
  n8n: 'n8n',
  openclaw: 'OpenClaw',
  'http-deploy': 'HTTP Deploy',
  'system-prompt': 'System Prompt',
};

export const TAB_DESCRIPTIONS: Record<TabType, string> = {
  profile: 'Manage your profile and account settings',
  'user-management': 'Create, edit, delete, and secure user accounts',
  settings: 'Configure application preferences',
  notifications: 'View and manage your notifications',
  features: 'Explore new and upcoming features',
  data: 'Manage your data and storage',
  'cloud-providers': 'Configure cloud AI providers and models',
  'local-providers': 'Configure local AI providers and models',
  github: 'Connect and manage GitHub integration',
  gitlab: 'Connect and manage GitLab integration',
  netlify: 'Connect to Plesk and manage hosting deployments',
  vercel: 'Connect to cPanel and manage hosting deployments',
  supabase: 'Setup Supabase and optional development PostgreSQL/PostgREST capabilities',
  'event-logs': 'View system events and logs',
  debug: 'Development-time debug functions and A/B testing controls',
  mcp: 'Configure MCP (Model Context Protocol) servers',
  n8n: 'Connect to n8n to trigger and manage workflow automations',
  openclaw: 'Configure OpenClaw tool bridge and allowed capabilities',
  'http-deploy': 'Set up Apache + PHP FTP deploy targets for HTTP deployments',
  'system-prompt': 'Configure the global system prompt and per-session custom instructions',
};

export const DEFAULT_TAB_CONFIG = [
  // User Window Tabs (Always visible by default)
  { id: 'profile', visible: true, window: 'user' as const, order: 0 },
  { id: 'user-management', visible: true, window: 'user' as const, order: 1 },
  { id: 'settings', visible: true, window: 'user' as const, order: 2 },
  { id: 'features', visible: true, window: 'user' as const, order: 3 },
  { id: 'data', visible: true, window: 'user' as const, order: 4 },
  { id: 'cloud-providers', visible: true, window: 'user' as const, order: 5 },
  { id: 'local-providers', visible: true, window: 'user' as const, order: 6 },
  { id: 'github', visible: true, window: 'user' as const, order: 7 },
  { id: 'gitlab', visible: true, window: 'user' as const, order: 8 },
  { id: 'netlify', visible: true, window: 'user' as const, order: 9 },
  { id: 'vercel', visible: true, window: 'user' as const, order: 10 },
  { id: 'supabase', visible: true, window: 'user' as const, order: 11 },
  { id: 'notifications', visible: true, window: 'user' as const, order: 12 },
  { id: 'event-logs', visible: true, window: 'user' as const, order: 13 },
  { id: 'debug', visible: true, window: 'user' as const, order: 14 },
  { id: 'mcp', visible: true, window: 'user' as const, order: 15 },
  { id: 'n8n', visible: true, window: 'user' as const, order: 16 },
  { id: 'openclaw', visible: true, window: 'user' as const, order: 17 },
  { id: 'http-deploy', visible: true, window: 'user' as const, order: 18 },
  { id: 'system-prompt', visible: true, window: 'user' as const, order: 19 },

  // User Window Tabs (In dropdown, initially hidden)
];
