"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvestmentMethodSelector } from "./investment-method-selector";
import { TransactionForm } from "./transaction-form";

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

type AddTransactionDialogProps = {
  open: boolean;
  onClose: () => void;
  methods: InvestmentMethod[];
  onSubmit: (data: {
    investmentMethodId: string;
    amount: string;
    date: Date;
    notes?: string;
    userId?: string;
  }) => void;
  isAdmin: boolean;
  users?: User[];
  adminUserId?: string;
};

export function AddTransactionDialog({
  open,
  onClose,
  methods,
  onSubmit,
  isAdmin,
  users = [],
  adminUserId,
}: AddTransactionDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<InvestmentMethod | null>(null);
  const [showSelector, setShowSelector] = useState(true);

  const handleMethodSelect = (method: InvestmentMethod) => {
    setSelectedMethod(method);
    setShowSelector(false);
  };

  const handleChangeMethod = () => {
    setShowSelector(true);
  };

  const handleSubmit = (data: { amount: string; date: Date; notes?: string; userId?: string }) => {
    if (!selectedMethod) return;
    
    onSubmit({
      investmentMethodId: selectedMethod.id,
      ...data,
    });

    setSelectedMethod(null);
    setShowSelector(true);
    onClose();
  };

  const handleClose = () => {
    setSelectedMethod(null);
    setShowSelector(true);
    onClose();
  };

  return (
    <>
      <InvestmentMethodSelector
        open={open && showSelector}
        onClose={handleClose}
        onSelect={handleMethodSelect}
        methods={methods}
      />
      <Dialog open={open && !showSelector && selectedMethod !== null} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>
          {selectedMethod && (
            <TransactionForm
              key={open ? 'open' : 'closed'}
              selectedMethod={selectedMethod}
              onChangeMethod={handleChangeMethod}
              onSubmit={handleSubmit}
              onCancel={handleClose}
              isAdmin={isAdmin}
              users={users}
              adminUserId={adminUserId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
