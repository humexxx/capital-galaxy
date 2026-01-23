import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PortalPageContainerProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
};

export function PortalPageContainer({
  children,
  className,
  fullWidth = false,
}: PortalPageContainerProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col gap-8 p-8",
        fullWidth ? "mx-auto" : "max-w-screen-2xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
}
