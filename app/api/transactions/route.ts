import { NextResponse } from "next/server";
import { createTransaction } from "@/lib/services/transaction-service";
import { getCurrentUser } from "@/lib/services/auth-server";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { investmentMethodId, amount, date, notes } = body;

    if (!investmentMethodId || !amount || !date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const transaction = await createTransaction(user.id, {
      investmentMethodId,
      type: "buy",
      amount,
      date: new Date(date),
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
