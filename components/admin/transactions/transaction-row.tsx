"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { Mono, Text } from "@/components/ui/typography";
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
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await approveTransaction(transaction.id);
        toast.success("Transaction approved");
      } catch {
        toast.error("Failed to approve");
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      try {
        await rejectTransaction(transaction.id);
        toast.success("Transaction rejected");
      } catch {
        toast.error("Failed to reject");
      }
    });
  };

  const getStatusVariant = (
    status: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (status === "approved") return "default";
    if (status === "rejected") return "destructive";
    if (status === "pending") return "secondary";
    return "outline";
  };

  const userDisplayName =
    transaction.user?.fullName || transaction.user?.email || "this user";

  return (
    <TableRow>
      <TableCell>
        <Mono>{format(new Date(transaction.date), "PPP")}</Mono>
      </TableCell>
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
            <div className="flex min-w-0 flex-col">
              <Text as="span" variant="body" weight="medium">
                {transaction.user.fullName || "Unknown"}
              </Text>
              <Mono className="max-w-48 truncate text-xs text-muted-foreground">
                {transaction.user.email}
              </Mono>
            </div>
          </div>
        ) : (
          <Text as="span" variant="muted">Unknown User</Text>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={transaction.type === "buy" ? "default" : "secondary"}>
          {transaction.type.toUpperCase()}
        </Badge>
      </TableCell>
      <TableCell>
        <Mono className="font-medium">${transaction.amount}</Mono>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(transaction.status)}>
          {transaction.status}
        </Badge>
      </TableCell>
      <TableCell>
        {transaction.approvedBy && transaction.approvedAt && (
          <div className="flex flex-col text-sm">
            <span className="font-medium text-success">
              {transaction.approvedBy.fullName || transaction.approvedBy.email}
            </span>
            <Mono className="text-xs text-muted-foreground">
              {format(new Date(transaction.approvedAt), "PPp")}
            </Mono>
          </div>
        )}
        {transaction.rejectedBy && transaction.rejectedAt && (
          <div className="flex flex-col text-sm">
            <span className="font-medium text-destructive">
              {transaction.rejectedBy.fullName || transaction.rejectedBy.email}
            </span>
            <Mono className="text-xs text-muted-foreground">
              {format(new Date(transaction.rejectedAt), "PPp")}
            </Mono>
          </div>
        )}
        {!transaction.approvedBy && !transaction.rejectedBy && (
          <Text as="span" variant="muted">-</Text>
        )}
      </TableCell>
      <TableCell className="text-right">
        {transaction.status === "pending" && (
          <div className="flex items-center justify-end gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-success"
                  aria-label={`Approve $${transaction.amount} ${transaction.type} for ${userDisplayName}`}
                  disabled={isPending}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve Transaction</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to approve this{" "}
                    <strong>${transaction.amount}</strong> {transaction.type}{" "}
                    transaction for <strong>{userDisplayName}</strong>
                    {transaction.user?.email && transaction.user?.fullName &&
                      ` (${transaction.user.email})`}
                    ?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApprove} disabled={isPending}>
                    {isPending ? "Approving..." : "Approve"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-destructive"
                  aria-label={`Reject $${transaction.amount} ${transaction.type} for ${userDisplayName}`}
                  disabled={isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject Transaction</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to reject this{" "}
                    <strong>${transaction.amount}</strong> {transaction.type}{" "}
                    transaction for <strong>{userDisplayName}</strong>
                    {transaction.user?.email && transaction.user?.fullName &&
                      ` (${transaction.user.email})`}
                    ? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReject}
                    disabled={isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isPending ? "Rejecting..." : "Reject"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
