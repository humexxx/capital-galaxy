interface AdminOnlyProps {
  isAdmin: boolean;
  children: React.ReactNode;
}

export function AdminOnly({ isAdmin, children }: AdminOnlyProps) {
  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}
