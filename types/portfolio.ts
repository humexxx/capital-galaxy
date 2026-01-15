import type { portfolios, investmentMethods } from "@/db/schema";

// Infer from schema
export type Portfolio = typeof portfolios.$inferSelect;

// Custom calculated types that don't exist in schema
export interface PortfolioStats {
  totalValue: number;
  costBasis: number;
  allTimeProfit: number;
  allTimeProfitPercentage: number;
}

// Transaction with joined investment method
export interface PortfolioTransaction {
  id: string;
  type: "buy" | "withdrawal";
  amount: string;
  fee: string;
  total: string;
  date: Date;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  investmentMethod: typeof investmentMethods.$inferSelect;
}

// Custom aggregated asset type
export interface PortfolioAsset {
  investmentMethod: typeof investmentMethods.$inferSelect;
  totalInvested: number;
  totalWithdrawn: number;
  holdingAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  hasPendingTransactions: boolean;
}
