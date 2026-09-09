import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { Category, ProjectRecord, ScanSummary, StoreData } from "./types.js";

const emptyStore = (): StoreData => ({ version: 1, projects: {}, scans: [] });

export class ProjectStore {
  constructor(private readonly filePath = path.join(config.dataDir, "projects.json")) {}

  async load(): Promise<StoreData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreData;
      if (!parsed.projects) return emptyStore();
      return parsed;
    } catch {
      return emptyStore();
    }
  }

  async save(data: StoreData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.filePath);
  }

  shouldSkip(project: ProjectRecord | undefined): boolean {
    return Boolean(project?.skippedFuture || project?.category === "not_worthy");
  }

  upsert(data: StoreData, incoming: ProjectRecord): ProjectRecord {
    const existing = data.projects[incoming.id];
    if (existing) {
      incoming.firstSeenAt = existing.firstSeenAt;
      incoming.overrideCategory = incoming.overrideCategory ?? existing.overrideCategory;
      if (existing.overrideCategory) {
        incoming.category = existing.overrideCategory;
        incoming.skippedFuture = existing.overrideCategory === "not_worthy";
      }
    }
    data.projects[incoming.id] = incoming;
    return incoming;
  }

  override(data: StoreData, id: string, category: Category): ProjectRecord | undefined {
    const project = data.projects[id];
    if (!project) return undefined;
    project.overrideCategory = category;
    project.category = category;
    project.skippedFuture = category === "not_worthy";
    return project;
  }

  list(data: StoreData, category?: Category): ProjectRecord[] {
    return Object.values(data.projects)
      .filter((project) => (category ? project.category === category : true))
      .sort((a, b) => b.score - a.score || (b.lastScannedAt > a.lastScannedAt ? 1 : -1));
  }

  appendScan(data: StoreData, scan: ScanSummary): void {
    data.scans = [...data.scans.slice(-49), scan];
  }
}
