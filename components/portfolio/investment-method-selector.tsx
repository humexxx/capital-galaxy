"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type InvestmentMethod = {
  id: string;
  name: string;
  author: string;
  riskLevel: string;
  monthlyRoi: number;
};

type InvestmentMethodSelectorProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (method: InvestmentMethod) => void;
  methods: InvestmentMethod[];
};

export function InvestmentMethodSelector({
  open,
  onClose,
  onSelect,
  methods,
}: InvestmentMethodSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMethods = methods.filter((method) =>
    method.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Investment Method</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <ScrollArea className="h-[400px]">
            <div className="flex flex-col gap-2">
              {filteredMethods.map((method) => (
                <Button
                  key={method.id}
                  variant="ghost"
                  className="flex h-auto items-center justify-between p-4"
                  onClick={() => {
                    onSelect(method);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-sm font-semibold text-primary">
                        {method.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{method.name}</span>
                      <span className="text-xs text-muted-foreground">{method.author}</span>
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
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
