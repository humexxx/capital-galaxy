export type TransactionInput = {
  investmentMethodId: string;
  type: "buy" | "withdrawal";
  amount: string;
  date: Date;
  notes?: string;
};

export interface Transaction {
  id: string;
  portfolioId: string;
  investmentMethodId: string;
  type: "buy" | "withdrawal";
  amount: string;
  fee: string;
  total: string;
  date: Date;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type AdminTransactionRow = {
  id: string;
  amount: string;
  total: string;
  date: Date;
  status: "pending" | "approved" | "rejected";
  type: "buy" | "withdrawal";
  notes: string | null;
  user: {
    id?: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  method: {
    name: string;
  } | null;
  portfolioName: string | null;
  approvedAt: Date | null;
  approvedBy: {
    id: string;
    email: string | null;
    fullName: string | null;
  } | null;
  rejectedAt: Date | null;
  rejectedBy: {
    id: string;
    email: string | null;
    fullName: string | null;
  } | null;
};
