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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
            <TableCell>
                {transaction.approvedBy && transaction.approvedAt && (
                    <div className="flex flex-col text-sm">
                        <span className="font-medium text-green-600">
                            {transaction.approvedBy.fullName || transaction.approvedBy.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {format(new Date(transaction.approvedAt), "PPp")}
                        </span>
                    </div>
                )}
                {transaction.rejectedBy && transaction.rejectedAt && (
                    <div className="flex flex-col text-sm">
                        <span className="font-medium text-red-600">
                            {transaction.rejectedBy.fullName || transaction.rejectedBy.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {format(new Date(transaction.rejectedAt), "PPp")}
                        </span>
                    </div>
                )}
                {!transaction.approvedBy && !transaction.rejectedBy && (
                    <span className="text-sm text-muted-foreground">-</span>
                )}
            </TableCell>
            <TableCell className="text-right">{transaction.status === "pending" && (
                    <div className="flex items-center justify-end gap-2">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 text-green-600"
                                    title="Approve"
                                >
                                    <Check className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Approve Transaction</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to approve this <strong>${transaction.amount}</strong> {transaction.type} transaction for <strong>{transaction.user?.fullName || transaction.user?.email}</strong>{transaction.user?.email && transaction.user?.fullName && ` (${transaction.user.email})`}?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={onApprove}>Approve</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 text-red-600"
                                    title="Reject"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reject Transaction</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to reject this <strong>${transaction.amount}</strong> {transaction.type} transaction for <strong>{transaction.user?.fullName || transaction.user?.email}</strong>{transaction.user?.email && transaction.user?.fullName && ` (${transaction.user.email})`}? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={onReject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reject</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}
