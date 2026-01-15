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
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function TransactionFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [userId, setUserId] = useState(searchParams.get("userId") || "");
    const [status, setStatus] = useState(searchParams.get("status") || "pending");
    const [type, setType] = useState(searchParams.get("type") || "all");

    const applyFilters = () => {
        const params = new URLSearchParams(searchParams.toString());

        if (userId) params.set("userId", userId);
        else params.delete("userId");

        if (status && status !== "all") params.set("status", status);
        else params.delete("status");

        if (type && type !== "all") params.set("type", type);
        else params.delete("type");

        router.push(`?${params.toString()}`);
    };

    const clearFilters = () => {
        setUserId("");
        setStatus("pending");
        setType("all");
        router.push("?status=pending");
    };

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

            <div className="flex gap-2">
                <Button onClick={applyFilters}>Apply</Button>
                <Button variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
        </div>
    );
}
