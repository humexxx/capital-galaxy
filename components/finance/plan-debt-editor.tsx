"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heading, Text } from "@/components/ui/typography";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

import type { DebtPaymentType, FinancePlanDebt } from "@/types/finance";

type RecurrenceType =
  | "monthly_day"
  | "monthly_weekday"
  | "every_n_months";

type DebtInput = {
  name: string;
  initialBalance: string;
  monthlyInterestRate: string;
  monthlyPayment: string;
  paymentType: DebtPaymentType;
  minPaymentPercent: string;
  minPaymentFloor: string;
  // B1/B2 — pass through. The inline debt editor doesn't expose these yet;
  // they survive round-trips via the parent that supplies them.
  recurrenceType: RecurrenceType;
  dayOfMonth: number | null;
  weekOfMonth: number | null;
  dayOfWeek: number | null;
  intervalMonths: number | null;
  recurrenceStart: string | null;
};

type PlanDebtEditorProps = {
  debts: FinancePlanDebt[];
  onAdd: (input: DebtInput) => Promise<void>;
  onUpdate: (id: string, input: DebtInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const EMPTY_DRAFT: DebtInput = {
  name: "",
  initialBalance: "",
  monthlyInterestRate: "",
  monthlyPayment: "",
  paymentType: "fixed",
  minPaymentPercent: "",
  minPaymentFloor: "",
  recurrenceType: "monthly_day",
  dayOfMonth: null,
  weekOfMonth: null,
  dayOfWeek: null,
  intervalMonths: null,
  recurrenceStart: null,
};

export function PlanDebtEditor({ debts, onAdd, onUpdate, onDelete }: PlanDebtEditorProps) {
  const [draft, setDraft] = useState<DebtInput>(EMPTY_DRAFT);
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!draft.name.trim()) return;
    startTransition(async () => {
      try {
        await onAdd({
          name: draft.name.trim(),
          initialBalance: draft.initialBalance || "0",
          monthlyInterestRate: draft.monthlyInterestRate || "0",
          monthlyPayment: draft.monthlyPayment || "0",
          paymentType: draft.paymentType,
          minPaymentPercent: draft.minPaymentPercent || "0",
          minPaymentFloor: draft.minPaymentFloor || "0",
          recurrenceType: draft.recurrenceType,
          dayOfMonth: draft.dayOfMonth,
          weekOfMonth: draft.weekOfMonth,
          dayOfWeek: draft.dayOfWeek,
          intervalMonths: draft.intervalMonths,
          recurrenceStart: draft.recurrenceStart,
        });
        setDraft(EMPTY_DRAFT);
      } catch {
        toast.error("Failed to add debt");
      }
    });
  };

  const isPercent = draft.paymentType === "percent_of_balance";

  return (
    <div className="space-y-3">
      <div>
        <Heading level="h5" as="h3">Debts</Heading>
        <Text variant="small">
          Use <strong>Fixed</strong> for loans with a constant monthly payment, and{" "}
          <strong>% of balance</strong> for credit cards (the minimum shrinks as the
          balance drops, which produces a naturally curving payoff line).
        </Text>
      </div>

      {debts.length === 0 ? (
        <EmptyState title="No debts tracked yet" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-36">Balance</TableHead>
                <TableHead className="w-32">Rate (mo.)</TableHead>
                <TableHead className="w-38">Payment</TableHead>
                <TableHead className="w-50">Type</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.map((debt) => (
                <DebtRow key={debt.id} debt={debt} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-dashed p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            placeholder="Name (e.g. BAC card)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="max-w-xs"
            aria-label="New debt name"
          />
          <Input
            placeholder="Balance"
            inputMode="decimal"
            value={draft.initialBalance}
            onChange={(e) => setDraft({ ...draft, initialBalance: e.target.value })}
            className="max-w-36"
            aria-label="New debt balance"
          />
          <Input
            placeholder="Rate (0.02)"
            inputMode="decimal"
            value={draft.monthlyInterestRate}
            onChange={(e) => setDraft({ ...draft, monthlyInterestRate: e.target.value })}
            className="max-w-32"
            aria-label="New debt monthly rate"
          />
          <Select
            value={draft.paymentType}
            onValueChange={(v) =>
              setDraft({ ...draft, paymentType: v as DebtPaymentType })
            }
          >
            <SelectTrigger className="max-w-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed payment</SelectItem>
              <SelectItem value="percent_of_balance">% of balance (cards)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isPercent ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="% (0.02 = 2%)"
              inputMode="decimal"
              value={draft.minPaymentPercent}
              onChange={(e) => setDraft({ ...draft, minPaymentPercent: e.target.value })}
              className="max-w-40"
              aria-label="Minimum payment percent"
            />
            <Input
              placeholder="Floor ($25)"
              inputMode="decimal"
              value={draft.minPaymentFloor}
              onChange={(e) => setDraft({ ...draft, minPaymentFloor: e.target.value })}
              className="max-w-40"
              aria-label="Minimum payment floor"
            />
            <span className="text-xs text-muted-foreground">
              Each month: <strong>max(balance × %, floor)</strong>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Fixed monthly payment"
              inputMode="decimal"
              value={draft.monthlyPayment}
              onChange={(e) => setDraft({ ...draft, monthlyPayment: e.target.value })}
              className="max-w-50"
              aria-label="New debt monthly payment"
            />
          </div>
        )}

        <Button
          onClick={handleAdd}
          disabled={isPending || draft.name.trim().length === 0}
          size="sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Add debt
        </Button>
      </div>
    </div>
  );
}

function DebtRow({
  debt,
  onUpdate,
  onDelete,
}: {
  debt: FinancePlanDebt;
  onUpdate: PlanDebtEditorProps["onUpdate"];
  onDelete: PlanDebtEditorProps["onDelete"];
}) {
  const [name, setName] = useState(debt.name);
  const [balance, setBalance] = useState(debt.initialBalance);
  const [rate, setRate] = useState(debt.monthlyInterestRate);
  const [payment, setPayment] = useState(debt.monthlyPayment);
  const [paymentType, setPaymentType] = useState<DebtPaymentType>(
    debt.paymentType as DebtPaymentType
  );
  const [minPercent, setMinPercent] = useState(debt.minPaymentPercent);
  const [minFloor, setMinFloor] = useState(debt.minPaymentFloor);
  const [isPending, startTransition] = useTransition();

  const commit = (overrides: Partial<DebtInput> = {}) => {
    const next: DebtInput = {
      name: overrides.name ?? name.trim(),
      initialBalance: overrides.initialBalance ?? (balance.trim() || "0"),
      monthlyInterestRate: overrides.monthlyInterestRate ?? (rate.trim() || "0"),
      monthlyPayment: overrides.monthlyPayment ?? (payment.trim() || "0"),
      paymentType: overrides.paymentType ?? paymentType,
      minPaymentPercent: overrides.minPaymentPercent ?? (minPercent.trim() || "0"),
      minPaymentFloor: overrides.minPaymentFloor ?? (minFloor.trim() || "0"),
      // Preserve the recurrence-model fields the row was loaded with — this
      // editor doesn't surface them, but inline edits should not blow them
      // away. The service writes `dayOfMonth ?? null`, so leaving it out of
      // the payload reset every payment day to the 1st on a blur.
      dayOfMonth:
        overrides.dayOfMonth !== undefined ? overrides.dayOfMonth : debt.dayOfMonth,
      recurrenceType:
        overrides.recurrenceType ?? (debt.recurrenceType as RecurrenceType),
      weekOfMonth:
        overrides.weekOfMonth !== undefined
          ? overrides.weekOfMonth
          : debt.weekOfMonth,
      dayOfWeek:
        overrides.dayOfWeek !== undefined
          ? overrides.dayOfWeek
          : debt.dayOfWeek,
      intervalMonths:
        overrides.intervalMonths !== undefined
          ? overrides.intervalMonths
          : debt.intervalMonths,
      recurrenceStart:
        overrides.recurrenceStart !== undefined
          ? overrides.recurrenceStart
          : debt.recurrenceStart,
    };
    startTransition(async () => {
      try {
        await onUpdate(debt.id, next);
      } catch {
        toast.error("Failed to save");
      }
    });
  };

  const isPercent = paymentType === "percent_of_balance";

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => commit()}
          disabled={isPending}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          onBlur={() => commit()}
          inputMode="decimal"
          disabled={isPending}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={() => commit()}
          inputMode="decimal"
          disabled={isPending}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        {isPercent ? (
          <div className="flex gap-1">
            <Input
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
              onBlur={() => commit()}
              inputMode="decimal"
              disabled={isPending}
              className="h-8"
              placeholder="%"
              title="Min % of balance"
            />
            <Input
              value={minFloor}
              onChange={(e) => setMinFloor(e.target.value)}
              onBlur={() => commit()}
              inputMode="decimal"
              disabled={isPending}
              className="h-8"
              placeholder="floor"
              title="Minimum dollar amount"
            />
          </div>
        ) : (
          <Input
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            onBlur={() => commit()}
            inputMode="decimal"
            disabled={isPending}
            className="h-8"
          />
        )}
      </TableCell>
      <TableCell>
        <Select
          value={paymentType}
          onValueChange={(v) => {
            const t = v as DebtPaymentType;
            setPaymentType(t);
            commit({ paymentType: t });
          }}
          disabled={isPending}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="percent_of_balance">% of balance</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() =>
            startTransition(async () => {
              try {
                await onDelete(debt.id);
              } catch {
                toast.error("Failed to delete");
              }
            })
          }
          disabled={isPending}
          aria-label={`Delete ${debt.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
