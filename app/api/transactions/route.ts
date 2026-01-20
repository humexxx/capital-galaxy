import { NextResponse } from "next/server";
import { createTransaction } from "@/lib/services/transaction-service";
import { getCurrentUser, getUserRole } from "@/lib/services/auth-server";
import { createApprovalSnapshot } from "@/lib/services/snapshot-service";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    const isAdmin = role === "admin";
    const body = await request.json();
    const { investmentMethodId, amount, date, notes, userId } = body;

    if (!investmentMethodId || !amount || !date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let targetUserId = user.id;
    
    if (userId) {
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: Only admins can create transactions for other users" },
          { status: 403 }
        );
      }
      targetUserId = userId;
    }

    const transactionDate = new Date(date);
    const now = new Date();
    
    if (!isAdmin) {
      const daysDifference = Math.abs(
        (transactionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysDifference > 1) {
        return NextResponse.json(
          { error: "Regular users can only create transactions with the current date" },
          { status: 400 }
        );
      }
      
      transactionDate.setTime(now.getTime());
    }

    const { transaction, portfolio } = await createTransaction(targetUserId, {
      investmentMethodId,
      type: "buy",
      amount,
      date: transactionDate,
      notes,
    }, isAdmin);

    if (isAdmin && transaction.status === "approved") {
      await createApprovalSnapshot(portfolio.id);
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Transaction creation error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
