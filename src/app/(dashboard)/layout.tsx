import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { getWorkspaceForUser } from '@/lib/services/workspace';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const workspace = await getWorkspaceForUser(supabase);

  return (
    <WorkspaceProvider
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.owner_id,
      }}
    >
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Sidebar userEmail={user.email} workspaceName={workspace.name} />
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </WorkspaceProvider>
  );
}
