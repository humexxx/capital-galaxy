"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, DollarSign, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { format } from "date-fns";

type InvestmentMethod = {
  id: string;
  name: string;
  author: string;
  riskLevel: string;
  monthlyRoi: number;
};

type User = {
  id: string;
  fullName: string | null;
  email: string | null;
};

type TransactionFormProps = {
  selectedMethod: InvestmentMethod;
  onChangeMethod: () => void;
  onSubmit: (data: {
    amount: string;
    date: Date;
    notes?: string;
    userId?: string;
  }) => void;
  onCancel: () => void;
  isAdmin: boolean;
  users?: User[];
};

export function TransactionForm({
  selectedMethod,
  onChangeMethod,
  onSubmit,
  onCancel,
  isAdmin,
  users = [],
}: TransactionFormProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "withdrawal">("buy");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const fee = "0";
  const total = amount ? (parseFloat(amount) + parseFloat(fee)).toFixed(2) : "0";

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (isAdmin && !selectedUserId) return;
    
    onSubmit({
      amount,
      date,
      notes: notes || undefined,
      ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 rounded-lg bg-muted p-1">
        <Button
          variant={activeTab === "buy" ? "default" : "ghost"}
          className="flex-1"
          onClick={() => setActiveTab("buy")}
        >
          Buy
        </Button>
        <Button
          variant={activeTab === "withdrawal" ? "default" : "ghost"}
          className="flex-1"
          disabled
        >
          Withdrawal
        </Button>
      </div>

      <div className="flex cursor-pointer items-center justify-between rounded-lg border p-4" onClick={onChangeMethod}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-semibold text-primary">
              {selectedMethod.name.substring(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">{selectedMethod.name}</span>
            <span className="text-xs text-muted-foreground">{selectedMethod.author}</span>
          </div>
        </div>
        <svg
          className="h-5 w-5 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      <FieldGroup>
        {isAdmin && (
          <Field>
            <FieldLabel htmlFor="user">User</FieldLabel>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select a user" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="amount">Amount</FieldLabel>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              className="pl-10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field className="col-span-2">
            <FieldLabel>Date</FieldLabel>
            {isAdmin ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                disabled
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "MMM d, yyyy")}
              </Button>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="fee">Fee</FieldLabel>
            <Input
              id="fee"
              value={`$ ${fee}`}
              disabled
              className="bg-muted"
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            placeholder="Optional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>
      </FieldGroup>

      <div className="rounded-lg bg-muted p-4">
        <div className="text-sm text-muted-foreground">Total Spent</div>
        <div className="text-3xl font-bold">$ {total}</div>
      </div>

      <div className="flex gap-2">
        <Button onClick={onCancel} variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={!amount || parseFloat(amount) <= 0 || (isAdmin && !selectedUserId)}
        >
          Add Transaction
        </Button>
      </div>
    </div>
  );
}
