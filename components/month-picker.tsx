"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { useRouter, useSearchParams } from "next/navigation"

export function MonthPicker() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const [date, setDate] = React.useState(() => {
    const paramMonth = searchParams.get("month")
    const paramYear = searchParams.get("year")
    
    if (paramMonth && paramYear) {
      return new Date(parseInt(paramYear), parseInt(paramMonth), 1)
    }
    return new Date()
  })

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ]

  const handleMonthSelect = (monthIndex: number) => {
    // Prevent selection if month is in future
    if (date.getFullYear() > currentYear || (date.getFullYear() === currentYear && monthIndex > currentMonth)) {
      return
    }

    const newDate = new Date(date)
    newDate.setMonth(monthIndex)
    setDate(newDate)
    updateUrl(newDate.getMonth(), newDate.getFullYear())
  }

  const changeYear = (offset: number) => {
    const newDate = new Date(date)
    newDate.setFullYear(date.getFullYear() + offset)
    
    // If future year, reset to current year (or handle differently based on req)
    // Requirement says "no select month in future", implying we shouldn't even go to future years usually, 
    // but navigating to see past years is fine. Future years should probably be blocked.
    if (newDate.getFullYear() > currentYear) {
      return
    }

    setDate(newDate)
    updateUrl(newDate.getMonth(), newDate.getFullYear())
  }

  const updateUrl = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams)
    params.set("month", month.toString())
    params.set("year", year.toString())
    router.replace(`?${params.toString()}`)
  }

  return (
    <SidebarGroup className="px-0">
      <SidebarGroupContent>
        <div className="p-4 flex flex-col gap-4">
          <Button 
            variant={!searchParams.get("month") ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              const params = new URLSearchParams(searchParams)
              params.delete("month")
              params.delete("year")
              router.replace(`?${params.toString()}`)
              setDate(new Date())
            }}
          >
            All Time
          </Button>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => changeYear(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-sm">{date.getFullYear()}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => changeYear(1)}
              disabled={date.getFullYear() >= currentYear}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => {
              const viewYear = date.getFullYear()
              const isFuture = viewYear === currentYear && index > currentMonth
              
              // Check if this month is visually selected (matches URL params)
              // We check param existence to avoid "All Time" defaulting to January
              const paramMonth = searchParams.get("month")
              const paramYear = searchParams.get("year")
              const isSelected = paramMonth !== null && 
                                 paramYear !== null &&
                                 parseInt(paramMonth) === index && 
                                 parseInt(paramYear) === viewYear

              // Check if this is the actual current month (for secondary highlight)
              const isCurrent = viewYear === currentYear && index === currentMonth

              let variant: "default" | "secondary" | "ghost" = "ghost"
              if (isSelected) {
                variant = "default"
              } else if (isCurrent) {
                variant = "secondary"
              }

              return (
                <Button
                  key={month}
                  variant={variant}
                  size="sm"
                  className="h-8 text-xs font-normal"
                  onClick={() => handleMonthSelect(index)}
                  disabled={isFuture}
                >
                  {month}
                </Button>
              )
            })}
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
