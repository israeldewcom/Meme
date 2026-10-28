import { randomUUID } from "crypto";
import { RoadmapItem } from "../models/RoadmapItem";

type Status = "planned" | "in_progress" | "completed" | "delayed" | "cancelled";

export class RoadmapService {
  static toFrontend(item: any) {
    const map: Record<string, "done" | "active" | "planned" | "delayed" | "cancelled"> = {
      completed: "done", in_progress: "active", planned: "planned", delayed: "delayed", cancelled: "cancelled"
    };
    return {
      phase: item.phase, title: item.title, desc: item.description,
      status: map[item.status] || "planned", when: item.when, evidence: item.evidence || null
    };
  }

  static list(tenantId: string) {
    return RoadmapItem.find({ tenantId }).sort({ order: 1 }).lean();
  }

  static async replaceAll(
    tenantId: string,
    items: Array<{ phase: string; title: string; description: string; status?: Status; when?: string; evidence?: string }>
  ) {
    const batch = randomUUID();
    if (items.length) {
      await RoadmapItem.insertMany(
        items.map((r, i) => ({
          tenantId, phase: r.phase, title: r.title, description: r.description,
          status: r.status || "planned", when: r.when || "", evidence: r.evidence, order: i, batch
        }))
      );
    }
    await RoadmapItem.deleteMany({ tenantId, batch: { $ne: batch } });
    return this.list(tenantId);
  }
}
