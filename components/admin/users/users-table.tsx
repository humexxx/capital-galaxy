"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserCog,
  UserRound,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Mono, Text } from "@/components/ui/typography";

import { startImpersonationAction } from "@/app/actions/impersonation";
import { updateUserRoleAction } from "@/app/actions/admin-users";

import { USER_ROLES, type UserListItem, type UserRole } from "@/types";

// One entry per role, in the order the menu lists them. The role answers a
// single question — may this account create investment methods — so the
// labels say that rather than restating the enum.
const ROLE_META: Record<UserRole, { label: string; hint: string; icon: typeof UserRound }> = {
  admin: { label: "Admin", hint: "Everything, plus impersonation", icon: ShieldCheck },
  provider: { label: "Provider", hint: "Can run investment methods", icon: Briefcase },
  user: { label: "User", hint: "Invests through providers", icon: UserRound },
};

type UsersTableProps = {
  users: UserListItem[];
  currentAdminId: string;
};

type PendingRoleChange = {
  user: UserListItem;
  nextRole: UserRole;
};

export function UsersTable({ users, currentAdminId }: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);
  const [isRolePending, startRoleTransition] = useTransition();

  const sortedUsers = useMemo(() => {
    // Pin the current admin to the top so it is always immediately visible.
    return [...users].sort((a, b) => {
      if (a.id === currentAdminId) return -1;
      if (b.id === currentAdminId) return 1;
      return 0;
    });
  }, [users, currentAdminId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter((u) => {
      const name = (u.fullName ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || u.id.toLowerCase().includes(q);
    });
  }, [sortedUsers, query]);

  const confirmRoleChange = () => {
    if (!pendingRoleChange) return;
    const { user, nextRole } = pendingRoleChange;
    startRoleTransition(async () => {
      try {
        await updateUserRoleAction({ userId: user.id, role: nextRole });
        toast.success(
          `${user.fullName ?? user.email ?? "User"} is now ${ROLE_META[nextRole].label.toLowerCase()}`
        );
        setPendingRoleChange(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update role");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by name, email or id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Filter users"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={query ? "No users match your filter" : "No users yet"}
          description={query ? "Try a different query." : undefined}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="w-30">Role</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const isSelf = user.id === currentAdminId;
                const role: UserRole = user.role ?? "user";
                const isAdmin = role === "admin";
                const displayName = user.fullName || user.email || "Unknown";
                const initial = (user.fullName || user.email || "?").charAt(0).toUpperCase();
                const RoleIcon = ROLE_META[role].icon;

                return (
                  <TableRow key={user.id} className={isSelf ? "bg-muted/30" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatarUrl ?? ""} alt={displayName} />
                          <AvatarFallback>{initial}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Text as="span" variant="body" weight="medium">{displayName}</Text>
                            {isSelf && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          {user.email && (
                            <Mono className="text-xs text-muted-foreground">{user.email}</Mono>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1">
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_META[role].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isSelf ? (
                        // No actions on yourself: keeps the UI honest and avoids a
                        // dropdown with everything greyed out.
                        <Text as="span" variant="small" aria-label="No actions available">
                          —
                        </Text>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${displayName}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {!isAdmin ? (
                              <form action={startImpersonationAction}>
                                <input type="hidden" name="userId" value={user.id} />
                                <DropdownMenuItem asChild>
                                  <button
                                    type="submit"
                                    className="w-full cursor-pointer text-left"
                                  >
                                    <UserCog className="mr-2 h-4 w-4" />
                                    Impersonate
                                  </button>
                                </DropdownMenuItem>
                              </form>
                            ) : (
                              <DropdownMenuItem disabled>
                                <UserCog className="mr-2 h-4 w-4" />
                                Impersonate
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-2xs font-normal uppercase tracking-wide text-muted-foreground">
                              Set role
                            </DropdownMenuLabel>
                            {USER_ROLES.filter((r) => r !== role).map((nextRole) => {
                              const Icon = ROLE_META[nextRole].icon;
                              return (
                                <DropdownMenuItem
                                  key={nextRole}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setPendingRoleChange({ user, nextRole });
                                  }}
                                >
                                  <Icon className="mr-2 h-4 w-4" />
                                  {ROLE_META[nextRole].label}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={pendingRoleChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRoleChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRoleChange
                ? `Change role to ${ROLE_META[pendingRoleChange.nextRole].label}?`
                : "Change role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRoleChange && (
                <>
                  <strong>{pendingRoleChange.user.fullName ?? pendingRoleChange.user.email}</strong>{" "}
                  becomes {ROLE_META[pendingRoleChange.nextRole].label.toLowerCase()}:{" "}
                  {ROLE_META[pendingRoleChange.nextRole].hint.toLowerCase()}.
                  {pendingRoleChange.user.role === "admin" &&
                    pendingRoleChange.nextRole !== "admin" &&
                    " They lose admin access immediately."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRolePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange} disabled={isRolePending}>
              {isRolePending ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
