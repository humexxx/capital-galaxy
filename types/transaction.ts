export type TransactionInput = {
    investmentMethodId: string;
    type: "buy" | "withdrawal";
    amount: string;
    date: Date;
    notes?: string;
  };
