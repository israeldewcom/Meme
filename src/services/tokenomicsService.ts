import { randomUUID } from "crypto";
import { Allocation } from "../models/Tokenomics";
import { Token } from "../models/Token";
import { ApiError } from "../utils/ApiError";

export class TokenomicsService {
  static async getForTenant(tenantId: string, mint: string) {
    const token = await Token.findOne({ tenantId, mint }).lean();
    if (!token) throw ApiError.notFound("Token not found");
    const rows = await Allocation.find({ tenantId, tokenId: token._id }).sort({ order: 1 }).lean();
    return {
      token,
      allocations: rows.map((r) => ({ name: r.name, pct: r.percentage, amount: Number(r.amount), vesting: r.vesting, color: r.color }))
    };
  }

  /** Insert-then-prune so a failed insert never leaves the tenant with zero rows. */
  static async replaceAll(
    tenantId: string,
    mint: string,
    rows: Array<{ name: string; percentage: number; amount?: string; vesting?: string; color?: string }>
  ) {
    const token = await Token.findOne({ tenantId, mint });
    if (!token) throw ApiError.notFound("Token not found");
    const batch = randomUUID();
    if (rows.length) {
      await Allocation.insertMany(
        rows.map((r, i) => ({
          tenantId, tokenId: token._id, name: r.name, percentage: r.percentage, amount: r.amount || "0",
          vesting: r.vesting || "", color: r.color || "#C6FF4D", order: i, batch
        }))
      );
    }
    await Allocation.deleteMany({ tenantId, tokenId: token._id, batch: { $ne: batch } });
    return Allocation.find({ tenantId, tokenId: token._id }).sort({ order: 1 }).lean();
  }
}
