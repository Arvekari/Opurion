export interface PleskDomain {
  id?: number;
  name: string;
}

export interface PleskUser {
  login?: string;
  email?: string;
  fullName?: string;
}

export interface PleskConnection {
  user: PleskUser | null;
  token: string;
  host: string;
  rootPath: string;
  stats?: {
    domains: PleskDomain[];
    totalDomains: number;
  };
}
