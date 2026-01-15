"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useTransition } from "react";

export function TransactionFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [userId, setUserId] = useState(searchParams.get("userId") || "");
    const [status, setStatus] = useState(searchParams.get("status") || "pending");
    const [type, setType] = useState(searchParams.get("type") || "all");

    useEffect(() => {
        const params = new URLSearchParams();

        if (userId) params.set("userId", userId);
        if (status && status !== "all") params.set("status", status);
        else if (status === "all") params.set("status", "all");
        if (type && type !== "all") params.set("type", type);

        const newUrl = params.toString() ? `?${params.toString()}` : "/portal/admin/transactions";
        
        startTransition(() => {
            router.replace(newUrl);
        });
    }, [userId, status, type, router]);

    return (
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="flex flex-col gap-2 w-full sm:w-75">
                <span className="text-sm font-medium">User ID</span>
                <Input
                    placeholder="Filter by User ID..."
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-2 w-full sm:w-50">
                <span className="text-sm font-medium">Status</span>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                        <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex flex-col gap-2 w-full sm:w-50">
                <span className="text-sm font-medium">Type</span>
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="withdrawal">Withdrawal</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
