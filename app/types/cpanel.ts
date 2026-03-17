export interface CPanelUser {
  user: string;
  contact_email?: string;
}

export interface CPanelConnection {
  user: CPanelUser | null;
  token: string;
  host: string;
  username: string;
  rootPath: string;
  stats?: {
    domains: string[];
    totalDomains: number;
  };
}
