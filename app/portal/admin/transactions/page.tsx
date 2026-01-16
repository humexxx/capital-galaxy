import { getAdminTransactions } from "@/lib/services/admin-service";
import { DataTable } from "@/components/admin/transactions/data-table";
import { TransactionFilters } from "@/components/admin/transactions/filters";
import { requireAdmin } from "@/lib/services/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic"; // Ensure fresh data

export default async function AdminTransactionsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    // Auth Check - will throw if not admin
    try {
        await requireAdmin();
    } catch {
        redirect("/portal");
    }

    // Parse filters
    const params = await searchParams;
    const userId = typeof params.userId === "string" ? params.userId : undefined;
    
    // If no status param, default to pending. If status is explicitly in URL, use it (or undefined for "all")
    let status: "pending" | "approved" | "rejected" | undefined;
    if (params.status === undefined) {
        status = "pending"; // Default when first loading the page
    } else if (typeof params.status === "string" && ["pending", "approved", "rejected"].includes(params.status)) {
        status = params.status as "pending" | "approved" | "rejected";
    } else {
        status = undefined; // For "all" or any other value
    }
    
    const type = typeof params.type === "string" && ["buy", "withdrawal"].includes(params.type)
        ? (params.type as "buy" | "withdrawal")
        : undefined;

    const data = await getAdminTransactions({
        userId,
        status,
        type,
    });

    return (
        <div className="container mx-auto py-10">
            <h1 className="text-3xl font-bold mb-6">Transaction Management</h1>
            <p className="text-muted-foreground mb-8">
                Approve or reject transactions. Filter by user, status, or type.
            </p>

            <TransactionFilters />
            <DataTable data={data} />
        </div>
    );
}
