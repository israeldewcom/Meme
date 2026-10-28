export type UserRole = "super_admin" | "tenant_admin" | "admin" | "editor" | "moderator" | "analyst" | "member";

export const ROLE_RANK: Record<UserRole, number> = {
  super_admin: 100,
  tenant_admin: 90,
  admin: 80,
  editor: 50,
  moderator: 50,
  analyst: 40,
  member: 10
};

export interface AuthPayload {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  wallet?: string;
  jti?: string;
  iat?: number;
}

export interface FrontendQuote {
  price: number; change24h: number; liquidity: number; volume24h: number; marketCap: number; fdv: number;
  holders: number; circulatingSupply: number; totalSupply: number; pair: string; pairAddress: string;
  poolCreated: number; source: string; timestamp: number; isDemo: boolean;
}

export interface FrontendHistoryPoint { t: number; p: number }

export interface FrontendHolderRow {
  rank: number; address: string; balance: number; share: number; change: number; tag?: string | null; tagTone?: string;
}

export interface FrontendHolderSummary {
  totalHolders: number;
  holderCountIsSample: boolean;
  largestShare: number; top10Share: number; top20Share: number;
  denominator: string; source: string; timestamp: number;
}

export interface FrontendDistributionSegment { name: string; value: number; color: string }

export interface FrontendMeme {
  id: string; title: string; author: string; cat: string; likes: number; shares: number;
  g1: string; g2: string; date: number; imageUrl?: string; status?: string;
}

export interface FrontendChallenge {
  id: string; title: string; desc: string; status: "live" | "upcoming" | "ended"; start: number; end: number;
  entries: number; judging: string; prize: string; g1: string; g2: string; glyph: string;
}

export interface FrontendAnnouncement { id: string; title: string; body: string; date: number; pinned: boolean; tone: string }

export interface FrontendReferralStats {
  visits: number; uniqueVisitors: number; qualifiedEngagement: number; verifiedConversions: number;
  conversionRate: number; bestCampaign: string; created: number;
  funnel: Array<{ label: string; value: number; pct: number; color: string }>;
  recent: Array<{ code: string; event: string; ts: number }>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      tenantId?: string;
      tenant?: any;
      requestId?: string;
      validatedQuery?: any;
    }
  }
}
