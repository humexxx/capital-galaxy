import { AppHeader } from "@/components/app-header";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentUser, getUserRole } from "@/lib/services/auth-server";
import { PortalPageContainer } from "@/components/portal/page-container";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getUserRole(user.id) || "user";

  return (
    <SidebarProvider defaultOpen={false} className="[--sidebar-width-icon:3rem] transition-all duration-200">
      <AppSidebar role={role} />
      <SidebarInset>
        <AppHeader user={user} />
        <main className="flex-1">
          <PortalPageContainer className="gap-6 py-6 px-8">
            {children}
          </PortalPageContainer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
