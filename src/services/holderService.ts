import { Token } from "../models/Token";
import { HolderSnapshot } from "../models/HolderSnapshot";
import { solanaProvider } from "./solanaProvider";
import { cacheGet, cacheSet } from "../config/redis";
import { CACHE_KEYS, CACHE_TTL, DISTRIBUTION_COLORS } from "../config/constants";
import { env } from "../config/env";
import { FrontendHolderRow, FrontendHolderSummary, FrontendDistributionSegment } from "../types";
import { ApiError } from "../utils/ApiError";
import { logger } from "../config/logger";
import { pctOf, uiAmount } from "../utils/holderMath";
import { hashSeed, prng } from "../utils/prng";

export interface HolderPayload {
  summary: FrontendHolderSummary;
  leaderboard: FrontendHolderRow[];
  distribution: FrontendDistributionSegment[];
}

const FRESH_MS = 30 * 60 * 1000;

export class HolderService {
  static async getPayload(tenantId: string, mint: string): Promise<HolderPayload> {
    const cacheKey = CACHE_KEYS.holders(tenantId, mint);
    const cached = await cacheGet<HolderPayload>(cacheKey);
    if (cached) return cached;

    const token = await Token.findOne({ tenantId, mint }).lean();
    if (!token) throw ApiError.notFound("Token not registered in this tenant");

    const latest = await HolderSnapshot.findOne({ tenantId, mint }).sort({ capturedAt: -1 }).lean();
    const hasLatest = !!latest && latest.topWallets.length > 0;
    const fresh = hasLatest && Date.now() - new Date(latest!.capturedAt).getTime() < FRESH_MS;

    let payload: HolderPayload;
    if (fresh) {
      payload = this.shape(latest);
    } else {
      try {
        payload = await this.buildAndStore(tenantId, String(token._id), mint);
      } catch (err) {
        if (hasLatest) payload = this.shape(latest); // stale but real
        else if (env.DEMO_MODE) payload = this.demoPayload(mint);
        else throw ApiError.serviceUnavailable("Holder data temporarily unavailable");
        logger.warn({ err: (err as Error).message, mint }, "holder build failed; serving fallback");
      }
    }
    await cacheSet(cacheKey, payload, CACHE_TTL.holders);
    return payload;
  }

  static async refresh(mint: string): Promise<void> {
    const tokens = await Token.find({ mint }).select("_id tenantId").lean();
    for (const t of tokens) {
      try {
        await this.buildAndStore(String(t.tenantId), String(t._id), mint);
      } catch (err) {
        logger.warn({ err: (err as Error).message, mint }, "holder refresh failed");
      }
    }
  }

  private static async buildAndStore(tenantId: string, tokenId: string, mint: string): Promise<HolderPayload> {
    const [holders, supply, overview] = await Promise.all([
      solanaProvider.getTopHolders(mint),
      solanaProvider.getTokenSupply(mint),
      solanaProvider.getBirdeyeOverview(mint)
    ]);
    if (!holders?.length || !supply) throw new Error("No holder data from provider");

    const total = BigInt(supply.amount);
    const rows = holders.slice(0, 20).map((h) => ({
      address: h.address,
      raw: BigInt(h.balance),
      pct: pctOf(BigInt(h.balance), total)
    }));
    const cum = (n: number) => pctOf(rows.slice(0, n).reduce((s, r) => s + r.raw, 0n), total);

    const snapshot = await HolderSnapshot.create({
      tenantId,
      tokenId,
      mint,
      totalHolders: overview?.holders ?? rows.length,
      holderCountIsSample: !overview?.holders,
      largestShare: rows[0].pct,
      top10Share: cum(10),
      top20Share: cum(20),
      denominator: `total supply (${supply.uiAmount.toLocaleString("en-US")} tokens)`,
      source: overview?.holders ? "Solana RPC + Birdeye" : "Solana RPC",
      topWallets: rows.map((r) => ({
        address: r.address,
        balance: String(uiAmount(r.raw, supply.decimals)),
        pct: r.pct,
        change24h: 0
      })),
      capturedAt: new Date()
    });
    return this.shape(snapshot);
  }

  private static shape(snapshot: any): HolderPayload {
    const w: any[] = snapshot.topWallets || [];
    const sum = (a: number, b: number) => w.slice(a, b).reduce((s, x) => s + (x.pct || 0), 0);
    const top20 = sum(0, 20);
    return {
      summary: {
        totalHolders: snapshot.totalHolders,
        holderCountIsSample: !!snapshot.holderCountIsSample,
        largestShare: snapshot.largestShare,
        top10Share: snapshot.top10Share,
        top20Share: snapshot.top20Share,
        denominator: snapshot.denominator,
        source: snapshot.source,
        timestamp: new Date(snapshot.capturedAt).getTime()
      },
      leaderboard: w.map((x, i) => ({
        rank: i + 1,
        address: x.address,
        balance: Number(x.balance),
        share: x.pct,
        change: x.change24h || 0,
        tag: x.tag || null,
        tagTone: x.tag ? "violet" : undefined
      })),
      distribution: [
        { name: "Largest holder", value: w[0]?.pct || 0, color: DISTRIBUTION_COLORS[0] },
        { name: "Ranks 2–5", value: sum(1, 5), color: DISTRIBUTION_COLORS[1] },
        { name: "Ranks 6–10", value: sum(5, 10), color: DISTRIBUTION_COLORS[2] },
        { name: "Ranks 11–20", value: sum(10, 20), color: DISTRIBUTION_COLORS[3] },
        { name: "All other holders", value: Math.max(0, 100 - top20), color: DISTRIBUTION_COLORS[4] }
      ]
    };
  }

  private static demoPayload(mint: string): HolderPayload {
    const rand = prng(hashSeed(mint));
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const topWallets = Array.from({ length: 20 }).map((_, i) => {
      const pct = i === 0 ? 6 + rand() * 4 : Math.max(0.15, 3.2 - i * 0.14) * (0.8 + rand() * 0.4);
      let address = "";
      for (let k = 0; k < 44; k++) address += chars[Math.floor(rand() * chars.length)];
      return { address, balance: String(Math.round(pct * 10_000_000)), pct: Number(pct.toFixed(3)), change24h: Number(((rand() - 0.5) * 3).toFixed(2)), tag: i === 0 ? "Demo" : undefined };
    });
    const s = (n: number) => topWallets.slice(0, n).reduce((a, x) => a + x.pct, 0);
    return this.shape({
      topWallets,
      totalHolders: 5000 + Math.floor(rand() * 12_000),
      holderCountIsSample: false,
      largestShare: topWallets[0].pct,
      top10Share: s(10),
      top20Share: s(20),
      denominator: "total supply (demo)",
      source: "Simulated demo feed",
      capturedAt: new Date()
    });
  }
}
