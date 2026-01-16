"use client"

import * as React from "react"
import {
    PieChart,
    Home,
    TrendingUp,
    ShieldCheck,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppSidebar({ role, ...props }: React.ComponentProps<typeof Sidebar> & { role?: "admin" | "user" }) {
    const pathname = usePathname()

    const items = [
        {
            title: "Dashboard",
            url: "/portal",
            icon: Home,
        },
        {
            title: "Portfolio",
            url: "/portal/portfolio",
            icon: PieChart,
        },
        {
            title: "Investment Methods",
            url: "/portal/investment-methods",
            icon: TrendingUp,
        },
    ]

    // Add admin items if role is admin
    if (role === "admin") {
        items.push({
            title: "Transactions",
            url: "/portal/admin/transactions",
            icon: ShieldCheck,
        })
    }

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <div className="flex items-center gap-2 px-2 py-1">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                        C
                    </div>
                    <span className="font-bold text-lg group-data-[collapsible=icon]:hidden">
                        Capital Galaxy
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Menu</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                                        <Link href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    )
}
