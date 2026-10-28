export const CACHE_KEYS = {
  market: (mint: string) => `market:live:${mint}`,
  marketHistory: (mint: string, range: string) => `market:history:${mint}:${range}`,
  holders: (tenantId: string, mint: string) => `holders:${tenantId}:${mint}`,
  bootstrap: (slug: string) => `public:bootstrap:${slug}`
};

export const CACHE_TTL = { market: 20, marketHistory: 90, holders: 60, bootstrap: 30 };

export const HISTORY_RANGES: Record<string, { ms: number; step: number; points: number }> = {
  "1H": { ms: 3_600_000, step: 60_000, points: 60 },
  "6H": { ms: 6 * 3_600_000, step: 5 * 60_000, points: 72 },
  "24H": { ms: 24 * 3_600_000, step: 15 * 60_000, points: 96 },
  "7D": { ms: 7 * 24 * 3_600_000, step: 2 * 3_600_000, points: 84 },
  "30D": { ms: 30 * 24 * 3_600_000, step: 8 * 3_600_000, points: 90 }
};

export const DISTRIBUTION_COLORS = ["#9A72FF", "#C6FF4D", "#48DDF0", "#42D392", "#3B4252"];
export const MEME_CATEGORIES = ["classic", "reaction", "community", "launch", "art", "challenge", "other"] as const;
export const UPLOAD_FOLDERS = ["memes", "branding", "avatars"] as const;
export const AUTO_FLAG_REPORT_THRESHOLD = 5;
