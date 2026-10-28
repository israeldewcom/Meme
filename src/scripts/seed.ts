/**
 * Idempotent seed. Always ensures: bootstrap tenant + admin.
 * Only when DEMO_MODE=true: demo token, tokenomics, roadmap, memes, challenges, announcements.
 */
import { Keypair } from "@solana/web3.js";
import { connectMongo, disconnectMongo } from "../config/database";
import { Tenant } from "../models/Tenant";
import { User } from "../models/User";
import { Token } from "../models/Token";
import { Meme } from "../models/Meme";
import { Challenge } from "../models/Challenge";
import { Announcement } from "../models/Announcement";
import { RoadmapItem } from "../models/RoadmapItem";
import { Allocation } from "../models/Tokenomics";
import { ReferralLink } from "../models/Referral";
import { AuthService } from "../services/authService";
import { generateReferralCode } from "../utils/crypto";
import { env } from "../config/env";
import { logger } from "../config/logger";

async function seed() {
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD");
  if (env.NODE_ENV === "production" && (password.length < 12 || /change_?me/i.test(password))) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be 12+ chars and not a placeholder in production");
  }

  await connectMongo();
  // Make sure all indexes (unique constraints, TTL) exist before inserting.
  await Promise.all([Tenant, User, Token, Meme, Challenge, Announcement, RoadmapItem, Allocation, ReferralLink].map((m) => m.syncIndexes()));

  const slug = (env.BOOTSTRAP_TENANT_SLUG || "demo").toLowerCase();
  let tenant = await Tenant.findOne({ slug });

  if (!tenant) {
    const admin = await User.create({
      email,
      passwordHash: await AuthService.hashPassword(password),
      displayName: "Founder",
      role: "tenant_admin",
      referralCode: generateReferralCode()
    });
    tenant = await Tenant.create({
      name: env.BOOTSTRAP_TENANT_NAME || "Meme Launchpad Pro",
      slug,
      ownerId: admin._id,
      plan: "pro"
    });
    admin.tenantId = tenant._id;
    await admin.save();
    await ReferralLink.create({ tenantId: tenant._id, userId: admin._id, code: admin.referralCode });
    logger.info({ slug }, "Tenant + admin created");
  }

  if (!env.DEMO_MODE) {
    logger.info("DEMO_MODE=false: skipping demo content");
    await disconnectMongo();
    return;
  }

  const admin = await User.findOne({ tenantId: tenant._id, role: "tenant_admin" });
  if (!admin) throw new Error("Tenant has no admin");
  const tid = tenant._id;

  let token = await Token.findOne({ tenantId: tid });
  if (!token) {
    token = await Token.create({
      tenantId: tid,
      // Random valid-format address: deliberately NOT a real token, so market data falls back to the labelled demo feed.
      mint: Keypair.generate().publicKey.toBase58(),
      symbol: "MLP",
      name: "Meme Launchpad Pro",
      description: "A community-powered meme token built around humor, creativity and internet culture.",
      decimals: 6,
      totalSupply: "1000000000",
      circulatingSupply: "720000000",
      published: true,
      featured: true,
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      launchDate: new Date()
    });
    logger.info({ mint: token.mint }, "Demo token seeded");
  }

  if (!(await Allocation.exists({ tenantId: tid, tokenId: token._id }))) {
    const rows: Array<[string, number, string, string]> = [
      ["Community", 42, "No lock: distributed via community programs", "#C6FF4D"],
      ["Liquidity", 24, "Pooled at launch, locked per published terms", "#48DDF0"],
      ["Treasury", 14, "Multisig, 12-month linear release", "#9A72FF"],
      ["Development", 12, "6-month cliff, 18-month linear", "#42D392"],
      ["Marketing", 8, "Performance-reviewed, quarterly", "#FFBF69"]
    ];
    await Allocation.insertMany(
      rows.map(([name, pct, vesting, color], i) => ({
        tenantId: tid, tokenId: token!._id, name, percentage: pct, amount: String((1_000_000_000 * pct) / 100), vesting, color, order: i
      }))
    );
  }

  if (!(await RoadmapItem.exists({ tenantId: tid }))) {
    const items: Array<[string, string, string, "completed" | "in_progress" | "planned", string]> = [
      ["Phase 01", "Foundation & Launch", "Token deployment, verification, community channels and landing experience.", "completed", "Q1"],
      ["Phase 02", "Market Intelligence", "Live market dashboard, price history, transparent data-freshness indicators.", "completed", "Q1"],
      ["Phase 03", "Community Creation", "Meme studio, templates and the moderated public gallery.", "in_progress", "Q2"],
      ["Phase 04", "Challenges & Recognition", "Community competitions with published rules and documented judging.", "in_progress", "Q2"],
      ["Phase 05", "Referral Infrastructure", "Attribution tracking, qualified engagement reporting, abuse controls.", "planned", "Q3"],
      ["Phase 06", "Founder Control Center", "Self-service branding, content, moderation and analytics.", "planned", "Q3"],
      ["Phase 07", "White-Label Expansion", "Multi-project configuration, feature flags, tenant isolation.", "planned", "Q4"]
    ];
    await RoadmapItem.insertMany(items.map(([phase, title, description, status, when], i) => ({ tenantId: tid, phase, title, description, status, when, order: i })));
  }

  if (!(await Meme.exists({ tenantId: tid }))) {
    const memes: Array<[string, string, string, string, number, number, string]> = [
      ["WHEN THE CHART GOES SIDEWAYS", "reaction", "#9A72FF", "#48DDF0", 412, 88, "degen_0x"],
      ["MY PORTFOLIO AFTER ONE MEME", "classic", "#C6FF4D", "#4A8F1E", 366, 71, "lime_lord"],
      ["COMMUNITY > EVERYTHING", "community", "#42D392", "#48DDF0", 298, 54, "sol_samurai"],
      ["GM TO EVERYONE BUILDING", "classic", "#FFBF69", "#FF6678", 254, 44, "meme_miner"],
      ["LAUNCH DAY ENERGY", "launch", "#48DDF0", "#9A72FF", 232, 39, "pixel_ape"],
      ["MASCOT SAYS HOLD THE LINE", "art", "#C6FF4D", "#9A72FF", 201, 36, "art_whale"]
    ];
    await Meme.insertMany(
      memes.map(([title, category, g1, g2, likes, shares, author]) => ({
        tenantId: tid, tokenId: token!._id, uploaderId: admin._id, uploaderDisplayName: author, title,
        imageUrl: "/placeholder.svg", category, gradientFrom: g1, gradientTo: g2, status: "approved", likes, shares
      }))
    );
  }

  if (!(await Challenge.exists({ tenantId: tid }))) {
    const now = Date.now();
    const day = 86400e3;
    await Challenge.insertMany([
      { tenantId: tid, createdBy: admin._id, title: "Best Original Meme: Round 4", description: "Create the funniest original meme featuring the project mascot.", status: "live", start: new Date(now - 3 * day), end: new Date(now + 5 * day), judging: "Community vote + moderator review", prize: "Featured placement + community badge", glyph: "★" },
      { tenantId: tid, createdBy: admin._id, title: "Educational Explainer Sprint", description: "Short, accurate explainer about how Solana transactions work. No price predictions.", status: "upcoming", start: new Date(now + 2 * day), end: new Date(now + 16 * day), judging: "Accuracy + clarity review", prize: "Contributor badge", glyph: "◈", gradientFrom: "#48DDF0", gradientTo: "#42D392" }
    ]);
  }

  if (!(await Announcement.exists({ tenantId: tid }))) {
    await Announcement.insertMany([
      { tenantId: tid, authorId: admin._id, title: "Meme Studio v2 is live", body: "New templates, layer controls and high-resolution PNG export.", tone: "lime", pinned: true }
    ]);
  }

  logger.info("Seed complete");
  await disconnectMongo();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
