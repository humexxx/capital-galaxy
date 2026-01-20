export type SnapshotSource = "system_cron" | "system_approval" | "manual";

export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  date: Date;
  totalValue: string;
  source: SnapshotSource;
  createdAt?: Date;
}
