"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { approveTransaction, rejectTransaction } from "@/app/actions/admin-transactions";
import { toast } from "sonner";
import type { AdminTransactionRow } from "@/types/transaction";

interface TransactionRowProps {
    transaction: AdminTransactionRow;
}

export function TransactionRow({ transaction }: TransactionRowProps) {
    const onApprove = async () => {
        try {
            await approveTransaction(transaction.id);
            toast.success("Transaction approved");
        } catch (e) {
            toast.error("Failed to approve");
        }
    };

    const onReject = async () => {
        try {
            await rejectTransaction(transaction.id);
            toast.success("Transaction rejected");
        } catch (e) {
            toast.error("Failed to reject");
        }
    };

    const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
        if (status === "approved") return "default";
        if (status === "rejected") return "destructive";
        if (status === "pending") return "secondary";
        return "outline";
    };

    return (
        <TableRow>
            <TableCell>{format(new Date(transaction.date), "PPP")}</TableCell>
            <TableCell>
                {transaction.user ? (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={transaction.user.avatarUrl || ""} />
                            <AvatarFallback>
                                {transaction.user.fullName?.charAt(0) || 
                                 transaction.user.email?.charAt(0) || 
                                 "?"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">
                                {transaction.user.fullName || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {transaction.user.email}
                            </span>
                        </div>
                    </div>
                ) : (
                    <span className="text-sm text-muted-foreground">Unknown User</span>
                )}
            </TableCell>
            <TableCell>
                <Badge variant={transaction.type === "buy" ? "default" : "secondary"}>
                    {transaction.type.toUpperCase()}
                </Badge>
            </TableCell>
            <TableCell>
                <span className="font-medium">${transaction.amount}</span>
            </TableCell>
            <TableCell>
                <Badge variant={getStatusVariant(transaction.status)}>
                    {transaction.status}
                </Badge>
            </TableCell>
            <TableCell className="text-right">
                {transaction.status === "pending" && (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-green-600"
                            onClick={onApprove}
                            title="Approve"
                        >
                            <Check className="h-4 w-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-red-600"
                            onClick={onReject}
                            title="Reject"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}
