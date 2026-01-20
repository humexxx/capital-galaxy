import { NextResponse } from "next/server";
import { createTransaction } from "@/lib/services/transaction-service";
import { getCurrentUser, getUserRole } from "@/lib/services/auth-server";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    const body = await request.json();
    const { investmentMethodId, amount, date, notes, userId } = body;

    if (!investmentMethodId || !amount || !date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Determine target user ID
    let targetUserId = user.id;
    
    if (userId) {
      // If userId is provided, user must be admin
      if (role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden: Only admins can create transactions for other users" },
          { status: 403 }
        );
      }
      targetUserId = userId;
    }

    // Validate date: non-admin users can only create transactions with current date
    const transactionDate = new Date(date);
    const now = new Date();
    
    if (role !== "admin") {
      // Allow small time difference (within same day accounting for timezone)
      const daysDifference = Math.abs(
        (transactionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysDifference > 1) {
        return NextResponse.json(
          { error: "Regular users can only create transactions with the current date" },
          { status: 400 }
        );
      }
      
      // Force the date to be now for non-admin users
      transactionDate.setTime(now.getTime());
    }

    const transaction = await createTransaction(targetUserId, {
      investmentMethodId,
      type: "buy",
      amount,
      date: transactionDate,
      notes,
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Transaction creation error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
