"use client";

import { DataError } from "@/components/portal/data-error";
import { PortalPageContainer } from "@/components/portal/page-container";

export default function ProductivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The segment layout carries no container (board and road paths pick their
  // own widths), so the boundary supplies one.
  return (
    <PortalPageContainer>
      <DataError
        error={error}
        reset={reset}
        title="Couldn't load Productivity"
        backHref="/portal/productivity/board"
        backLabel="Back to Productivity"
      />
    </PortalPageContainer>
  );
}
