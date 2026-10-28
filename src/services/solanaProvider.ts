import axios, { AxiosInstance } from "axios";
import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface RawQuote {
  price: number; change24h: number; marketCap: number; fdv: number; volume24h: number; liquidity: number;
  holders: number; pair: string; pairAddress: string; poolCreated: number; source: string; isDemo: boolean;
  symbol?: string; name?: string; totalSupply?: string; circulatingSupply?: string;
}

export interface RawHolder { address: string; balance: string } // balance in raw base units

export class SolanaProvider {
  private connection: Connection;
  private http: AxiosInstance;

  constructor() {
    this.connection = new Connection(env.SOLANA_RPC_URL, env.SOLANA_COMMITMENT);
    this.http = axios.create({ timeout: 12_000 });
  }

  async ping(): Promise<boolean> {
    try {
      await this.connection.getVersion();
      return true;
    } catch {
      return false;
    }
  }

  async getTokenSupply(mint: string): Promise<{ amount: string; decimals: number; uiAmount: number } | null> {
    try {
      const supply = await this.connection.getTokenSupply(new PublicKey(mint));
      return { amount: supply.value.amount, decimals: supply.value.decimals, uiAmount: supply.value.uiAmount || 0 };
    } catch (err) {
      logger.debug({ err: (err as Error).message, mint }, "getTokenSupply failed");
      return null;
    }
  }

  /** On-chain mint facts (authorities, decimals, supply). null if not a mint / RPC failure. */
  async getMintInfo(mint: string) {
    try {
      const info = await this.connection.getParsedAccountInfo(new PublicKey(mint));
      const parsed: any = (info.value?.data as any)?.parsed;
      if (!parsed || parsed.type !== "mint") return null;
      return {
        decimals: Number(parsed.info.decimals),
        supply: String(parsed.info.supply),
        mintAuthority: (parsed.info.mintAuthority as string | null) ?? null,
        freezeAuthority: (parsed.info.freezeAuthority as string | null) ?? null
      };
    } catch (err) {
      logger.debug({ err: (err as Error).message, mint }, "getMintInfo failed");
      return null;
    }
  }

  async getDexScreenerQuote(mint: string): Promise<RawQuote | null> {
    try {
      const { data } = await this.http.get(`${env.DEXSCREENER_API_URL}/latest/dex/tokens/${mint}`);
      const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs.filter((p: any) => p.chainId === "solana") : [];
      if (!pairs.length) return null;
      const asBase = pairs.filter((p) => p.baseToken?.address === mint);
      const pool = (asBase.length ? asBase : pairs).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

      const price = parseFloat(pool.priceUsd) || 0;
      const impliedSupply = pool.fdv && price ? pool.fdv / price : 0;
      return {
        price,
        change24h: parseFloat(pool.priceChange?.h24) || 0,
        marketCap: pool.marketCap || pool.fdv || 0,
        fdv: pool.fdv || 0,
        volume24h: pool.volume?.h24 || 0,
        liquidity: pool.liquidity?.usd || 0,
        holders: 0,
        pair: `${pool.baseToken?.symbol || "TOKEN"} / ${pool.quoteToken?.symbol || "SOL"}`,
        pairAddress: pool.pairAddress || "",
        poolCreated: pool.pairCreatedAt || 0,
        source: "DexScreener",
        isDemo: false,
        symbol: pool.baseToken?.symbol,
        name: pool.baseToken?.name,
        totalSupply: impliedSupply ? String(Math.round(impliedSupply)) : "0",
        circulatingSupply: impliedSupply ? String(Math.round(impliedSupply)) : "0"
      };
    } catch (err) {
      logger.warn({ err: (err as Error).message, mint }, "DexScreener quote failed");
      return null;
    }
  }

  async getHistory(mint: string, range: string): Promise<Array<{ t: number; p: number }> | null> {
    if (!env.BIRDEYE_API_KEY) return null;
    const now = Math.floor(Date.now() / 1000);
    const rangeMap: Record<string, { type: string; from: number }> = {
      "1H": { type: "1m", from: now - 3600 },
      "6H": { type: "5m", from: now - 6 * 3600 },
      "24H": { type: "15m", from: now - 24 * 3600 },
      "7D": { type: "1H", from: now - 7 * 86400 },
      "30D": { type: "4H", from: now - 30 * 86400 }
    };
    const cfg = rangeMap[range] || rangeMap["24H"];
    try {
      const { data } = await this.http.get("https://public-api.birdeye.so/defi/history_price", {
        params: { address: mint, address_type: "token", type: cfg.type, time_from: cfg.from, time_to: now },
        headers: { "X-API-KEY": env.BIRDEYE_API_KEY, "x-chain": "solana" }
      });
      const items = data?.data?.items;
      if (!Array.isArray(items) || items.length < 2) return null;
      return items.map((it: any) => ({ t: it.unixTime * 1000, p: it.value }));
    } catch (err) {
      logger.warn({ err: (err as Error).message, mint, range }, "Birdeye history failed");
      return null;
    }
  }

  async getBirdeyeOverview(mint: string): Promise<{ holders?: number; marketCap?: number; fdv?: number } | null> {
    if (!env.BIRDEYE_API_KEY) return null;
    try {
      const { data } = await this.http.get("https://public-api.birdeye.so/defi/token_overview", {
        params: { address: mint },
        headers: { "X-API-KEY": env.BIRDEYE_API_KEY, "x-chain": "solana" }
      });
      const d = data?.data;
      if (!d) return null;
      return { holders: Number(d.holder) || undefined, marketCap: Number(d.mc) || undefined, fdv: Number(d.fdv) || undefined };
    } catch (err) {
      logger.warn({ err: (err as Error).message, mint }, "Birdeye overview failed");
      return null;
    }
  }

  /**
   * Largest holders by owner wallet, sorted by balance desc.
   * Uses getTokenLargestAccounts (top 20 token accounts) + owner resolution, aggregated per owner.
   * Needs an RPC that allows this method (use a private RPC in production).
   */
  async getTopHolders(mint: string): Promise<RawHolder[] | null> {
    try {
      const largest = await this.connection.getTokenLargestAccounts(new PublicKey(mint));
      const accts = largest.value.filter((a) => BigInt(a.amount) > 0n);
      if (!accts.length) return null;
      const infos = await this.connection.getMultipleParsedAccounts(accts.map((a) => a.address));
      const byOwner = new Map<string, bigint>();
      infos.value.forEach((info, i) => {
        const owner = (info?.data as any)?.parsed?.info?.owner as string | undefined;
        const key = owner || accts[i].address.toBase58();
        byOwner.set(key, (byOwner.get(key) ?? 0n) + BigInt(accts[i].amount));
      });
      return [...byOwner.entries()]
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .map(([address, bal]) => ({ address, balance: bal.toString() }));
    } catch (err) {
      logger.warn({ err: (err as Error).message, mint }, "getTopHolders failed");
      return null;
    }
  }
}

export const solanaProvider = new SolanaProvider();
