import { z } from "zod";
import type { Metadata } from "next";
import { getAdminTransactions } from "@/lib/services/admin-service";
import { DataTable } from "@/components/admin/transactions/data-table";
import { TransactionFilters } from "@/components/admin/transactions/filters";
import { requireAdminOrRedirect } from "@/lib/services/auth-server";
import { PageHeader } from "@/components/portal/page-header";

export const metadata: Metadata = {
  title: "Transaction Management",
  description: "Approve or reject user transactions and manage investment requests",
};

export const dynamic = "force-dynamic";

type AdminTransactionsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AdminTransactionsPage({
  searchParams,
}: AdminTransactionsPageProps) {
  await requireAdminOrRedirect();

  const params = await searchParams;
  // The filter box pushes every keystroke into the URL; a partial id bound
  // into `users.id = $1` is a Postgres uuid syntax error, not "no rows".
  const userId =
    typeof params.userId === "string" && z.string().uuid().safeParse(params.userId).success
      ? params.userId
      : undefined;

  // If status param is missing, default to "pending". An explicit "all" disables the filter.
  let status: "pending" | "approved" | "rejected" | undefined;
  if (params.status === undefined) {
    status = "pending";
  } else if (
    typeof params.status === "string" &&
    ["pending", "approved", "rejected"].includes(params.status)
  ) {
    status = params.status as "pending" | "approved" | "rejected";
  } else {
    status = undefined;
  }

  const type =
    typeof params.type === "string" && ["buy", "withdrawal"].includes(params.type)
      ? (params.type as "buy" | "withdrawal")
      : undefined;

  const data = await getAdminTransactions({ userId, status, type });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Transaction Management"
        description="Approve or reject transactions. Filter by user, status, or type."
      />
      <TransactionFilters />
      <DataTable data={data} />
    </section>
  );
}
