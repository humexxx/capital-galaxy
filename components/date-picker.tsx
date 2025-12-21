"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"

export function DatePicker() {
  const [date, setDate] = React.useState(new Date())

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ]

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(date)
    newDate.setMonth(monthIndex)
    setDate(newDate)
  }

  const changeYear = (offset: number) => {
    const newDate = new Date(date)
    newDate.setFullYear(date.getFullYear() + offset)
    setDate(newDate)
  }

  return (
    <SidebarGroup className="px-0">
      <SidebarGroupContent>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => changeYear(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-sm">{date.getFullYear()}</span>
            <Button variant="ghost" size="icon" onClick={() => changeYear(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => (
              <Button
                key={month}
                variant={date.getMonth() === index ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleMonthSelect(index)}
              >
                {month}
              </Button>
            ))}
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
