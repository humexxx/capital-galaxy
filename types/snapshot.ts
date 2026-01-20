import type { SnapshotSource } from "@/schemas/snapshot";

export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  date: Date;
  totalValue: string;
  source: SnapshotSource;
  createdAt?: Date;
}
