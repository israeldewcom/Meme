import { Token } from "../models/Token";
import { MarketHistory } from "../models/MarketHistory";
import { cacheGet, cacheSet, cacheDel } from "../config/redis";
import { CACHE_KEYS, CACHE_TTL, HISTORY_RANGES } from "../config/constants";
import { env } from "../config/env";
import { solanaProvider, RawQuote } from "./solanaProvider";
import { ApiError } from "../utils/ApiError";
import { FrontendQuote, FrontendHistoryPoint } from "../types";
import { logger } from "../config/logger";
import { hashSeed, prng } from "../utils/prng";

const DEMO_PRICE_BASE = 0.004218;

interface TokenLike {
  totalSupply?: string;
  circulatingSupply?: string;
  poolCreatedAt?: Date;
  lastMarketData?: any;
}

export class MarketService {
  private static async fetchRaw(mint: string): Promise<RawQuote | null> {
    const raw = await solanaProvider.getDexScreenerQuote(mint);
    if (!raw) return null;
    const ov = await solanaProvider.getBirdeyeOverview(mint);
    if (ov) {
      if (ov.holders) raw.holders = ov.holders;
      if (ov.marketCap) raw.marketCap = ov.marketCap;
      if (ov.fdv) raw.fdv = ov.fdv;
    }
    return raw;
  }

  static async getLiveQuote(mint: string, token?: TokenLike | null): Promise<FrontendQuote> {
    const cached = await cacheGet<FrontendQuote>(CACHE_KEYS.market(mint));
    if (cached) return cached;

    let raw = await this.fetchRaw(mint);

    if (!raw && token?.lastMarketData?.price) {
      const l = token.lastMarketData;
      raw = {
        price: l.price, change24h: l.change24h, marketCap: l.marketCap, fdv: l.fdv, volume24h: l.volume24h,
        liquidity: l.liquidity, holders: l.holders, pair: "TOKEN / SOL", pairAddress: "",
        poolCreated: token.poolCreatedAt ? new Date(token.poolCreatedAt).getTime() : 0,
        source: `${l.source || "stored"} (last known)`, isDemo: false
      };
    }

    if (!raw) {
      if (!env.DEMO_MODE) throw ApiError.serviceUnavailable("Market data temporarily unavailable");
      raw = this.demoQuote(mint);
    }

    if (token && !raw.isDemo) {
      // Admin-configured supply is more reliable than DexScreener's FDV/price estimate.
      const ts = Number(token.totalSupply) || 0;
      const cs = Number(token.circulatingSupply) || 0;
      if (ts > 0) {
        raw.totalSupply = String(ts);
        raw.circulatingSupply = String(cs || ts);
        if (!raw.fdv && raw.price) raw.fdv = raw.price * ts;
        if (!raw.marketCap && raw.price) raw.marketCap = raw.price * (cs || ts);
      }
    }

    const quote = this.toFrontendQuote(raw);
    await cacheSet(CACHE_KEYS.market(mint), quote, CACHE_TTL.market);
    return quote;
  }

  static async getHistory(mint: string, range: string): Promise<{ points: FrontendHistoryPoint[]; isDemo: boolean }> {
    const rangeKey = HISTORY_RANGES[range] ? range : "24H";
    const key = CACHE_KEYS.marketHistory(mint, rangeKey);
    const cached = await cacheGet<{ points: FrontendHistoryPoint[]; isDemo: boolean }>(key);
    if (cached) return cached;

    const stored = await MarketHistory.findOne({ mint, range: rangeKey, isDemo: false }).lean();
    if (stored && stored.points.length >= 2) {
      const out = { points: stored.points.map((p) => ({ t: p.t, p: p.p })), isDemo: false };
      await cacheSet(key, out, CACHE_TTL.marketHistory);
      return out;
    }

    const live = await solanaProvider.getHistory(mint, rangeKey);
    if (live && live.length >= 2) {
      const out = { points: live, isDemo: false };
      await cacheSet(key, out, CACHE_TTL.marketHistory);
      return out;
    }

    if (env.DEMO_MODE) return { points: this.demoHistory(mint, rangeKey), isDemo: true };
    return { points: [], isDemo: false };
  }

  static async refreshTokenData(tokenId: string): Promise<void> {
    const token = await Token.findById(tokenId);
    if (!token) return;
    try {
      const raw = await this.fetchRaw(token.mint);
      if (raw) {
        token.lastMarketData = {
          price: raw.price, change24h: raw.change24h, marketCap: raw.marketCap, fdv: raw.fdv,
          volume24h: raw.volume24h, liquidity: raw.liquidity, holders: raw.holders, source: raw.source,
          refreshedAt: new Date()
        };
        if (raw.pairAddress) token.pairAddress = raw.pairAddress;
        if (!token.poolCreatedAt && raw.poolCreated) token.poolCreatedAt = new Date(raw.poolCreated);
        await token.save();
      }
      await cacheDel(CACHE_KEYS.market(token.mint));
    } catch (err) {
      logger.warn({ err, tokenId }, "refreshTokenData failed");
    }
  }

  static async refreshHistory(tokenId: string): Promise<void> {
    const token = await Token.findById(tokenId);
    if (!token) return;
    for (const range of Object.keys(HISTORY_RANGES)) {
      try {
        const points = await solanaProvider.getHistory(token.mint, range);
        if (!points || points.length < 2) continue;
        await MarketHistory.findOneAndUpdate(
          { tenantId: token.tenantId, tokenId: token._id, range },
          { mint: token.mint, points, source: "Birdeye", isDemo: false, refreshedAt: new Date() },
          { upsert: true }
        );
        await cacheDel(CACHE_KEYS.marketHistory(token.mint, range));
      } catch (err) {
        logger.warn({ err, tokenId, range }, "refreshHistory range failed");
      }
    }
  }

  private static toFrontendQuote(raw: RawQuote): FrontendQuote {
    return {
      price: Number(raw.price) || 0,
      change24h: Number(raw.change24h) || 0,
      liquidity: Number(raw.liquidity) || 0,
      volume24h: Number(raw.volume24h) || 0,
      marketCap: Number(raw.marketCap) || 0,
      fdv: Number(raw.fdv) || 0,
      holders: Number(raw.holders) || 0,
      circulatingSupply: Number(raw.circulatingSupply) || 0,
      totalSupply: Number(raw.totalSupply) || 0,
      pair: raw.pair || "TOKEN / SOL",
      pairAddress: raw.pairAddress || "",
      poolCreated: Number(raw.poolCreated) || 0,
      source: raw.source || "unknown",
      timestamp: Date.now(),
      isDemo: !!raw.isDemo
    };
  }

  private static demoQuote(mint: string): RawQuote {
    const rand = prng(hashSeed(mint));
    const price = DEMO_PRICE_BASE * (0.85 + rand() * 0.3);
    const supply = 1_000_000_000;
    return {
      price, change24h: (rand() - 0.4) * 12, marketCap: price * supply * 0.72, fdv: price * supply,
      volume24h: 80_000 + rand() * 250_000, liquidity: 60_000 + rand() * 200_000,
      holders: 5000 + Math.floor(rand() * 12_000), pair: "MLP / SOL", pairAddress: "",
      poolCreated: Date.now() - 90 * 24 * 3600 * 1000, source: "Simulated demo feed", isDemo: true,
      totalSupply: String(supply), circulatingSupply: String(Math.round(supply * 0.72))
    };
  }

  private static demoHistory(mint: string, range: string): FrontendHistoryPoint[] {
    const cfg = HISTORY_RANGES[range] || HISTORY_RANGES["24H"];
    const rand = prng(hashSeed(mint + range));
    const now = Date.now();
    const out: FrontendHistoryPoint[] = [];
    let p = DEMO_PRICE_BASE;
    for (let i = cfg.points; i >= 0; i--) {
      p *= 1 + (rand() - 0.5) * 0.018;
      out.push({ t: now - i * cfg.step, p: Number(p.toFixed(9)) });
    }
    return out;
  }
}
