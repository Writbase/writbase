import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAgentKeyPermissions } from '@/lib/services/agent-keys'
import { Badge } from '@/components/ui/badge'
import { AgentKeyDetailEditor } from '@/components/agent-key-detail-editor'
import { PermissionEditor } from '@/components/permission-editor'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AgentKeyDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: key, error } = await supabase
    .from('agent_keys')
    .select(
      'id, name, role, key_prefix, is_active, special_prompt, created_at, last_used_at, created_by',
    )
    .eq('id', id)
    .single()

  if (error || !key) {
    notFound()
  }

  const permissions = await getAgentKeyPermissions(supabase, id)

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/agent-keys"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          &larr; Agent Keys
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {key.name}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
                {key.key_prefix}...
              </code>
              <Badge color={key.role === 'manager' ? 'purple' : 'blue'}>
                {key.role}
              </Badge>
              <Badge color={key.is_active ? 'green' : 'red'}>
                {key.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <span className="font-medium">Created:</span>{' '}
            {new Date(key.created_at).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">Last used:</span>{' '}
            {key.last_used_at
              ? new Date(key.last_used_at).toLocaleDateString()
              : 'Never'}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Settings
        </h2>
        <AgentKeyDetailEditor
          keyId={key.id}
          initialName={key.name}
          initialPrompt={key.special_prompt ?? ''}
          initialActive={key.is_active}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Permissions
        </h2>
        <PermissionEditor
          keyId={key.id}
          initialPermissions={permissions.map((p) => ({
            projectId: p.project_id,
            projectName: p.projects?.name ?? 'Unknown',
            departmentId: p.department_id,
            departmentName: p.departments?.name ?? null,
            canRead: p.can_read,
            canCreate: p.can_create,
            canUpdate: p.can_update,
          }))}
        />
      </div>
    </div>
  )
}
