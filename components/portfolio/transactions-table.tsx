"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type InvestmentMethod = {
  id: string;
  name: string;
  author: string;
  riskLevel: string;
  monthlyRoi: number;
};

type Transaction = {
  id: string;
  type: "buy" | "withdrawal";
  amount: string;
  fee: string;
  total: string;
  initialValue?: string | null;
  currentValue?: string | null;
  date: Date;
  status: "pending" | "approved" | "rejected" | "closed";
  notes?: string | null;
  investmentMethod: InvestmentMethod;
};

type TransactionsTableProps = {
  transactions: Transaction[];
};

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-muted-foreground">No transactions yet. Add your first transaction to get started.</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-500">Approved</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500 bg-yellow-500/10">Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    return type === "buy" 
      ? <Badge variant="secondary">Buy</Badge>
      : <Badge variant="outline">Withdrawal</Badge>;
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Investment Method</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Initial Value</TableHead>
            <TableHead>Current Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">
                {format(new Date(transaction.date), "MMM d, yyyy")}
                <div className="text-xs text-muted-foreground">
                  {format(new Date(transaction.date), "h:mm a")}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-xs font-semibold text-primary">
                      {transaction.investmentMethod.name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{transaction.investmentMethod.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {transaction.investmentMethod.author}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>{getTypeBadge(transaction.type)}</TableCell>
              <TableCell>${parseFloat(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              <TableCell>${parseFloat(transaction.fee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              <TableCell className="font-semibold">${parseFloat(transaction.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              <TableCell>
                {transaction.type === "buy" && transaction.initialValue ? (
                  <span>${parseFloat(transaction.initialValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {transaction.type === "buy" && transaction.currentValue && transaction.initialValue ? (
                  <div className="flex flex-col">
                    <span className="font-medium">
                      ${parseFloat(transaction.currentValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {(() => {
                      const initial = parseFloat(transaction.initialValue);
                      const current = parseFloat(transaction.currentValue);
                      const growth = ((current - initial) / initial) * 100;
                      return (
                        <span className={`text-xs ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {growth >= 0 ? '+' : ''}{growth.toFixed(2)}%
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{getStatusBadge(transaction.status)}</TableCell>
              <TableCell>
                {transaction.notes ? (
                  <span className="text-sm text-muted-foreground">{transaction.notes}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
