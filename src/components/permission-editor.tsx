'use client';

import { useCallback, useEffect, useState } from 'react';
import { updateAgentKeyPermissionsAction } from '@/app/(dashboard)/actions/agent-key-actions';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { apiGet } from '@/lib/utils/api-client';

interface PermissionRow {
  projectId: string;
  projectName: string;
  departmentId: string | null;
  departmentName: string | null;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canAssign: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PermissionEditorProps {
  keyId: string;
  initialPermissions: PermissionRow[];
}

export function PermissionEditor({ keyId, initialPermissions }: PermissionEditorProps) {
  const [rows, setRows] = useState<PermissionRow[]>(initialPermissions);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, deptData] = await Promise.all([
        apiGet<ProjectOption[]>('/api/projects'),
        apiGet<DepartmentOption[]>('/api/departments'),
      ]);
      setProjects(projData ?? []);
      setDepartments(deptData ?? []);
    } catch {
      // Selectors will just be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  function addRow() {
    if (projects.length === 0) return;
    setRows((prev) => [
      ...prev,
      {
        projectId: projects[0].id,
        projectName: projects[0].name,
        departmentId: null,
        departmentName: null,
        canRead: true,
        canCreate: false,
        canUpdate: false,
        canAssign: false,
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, updates: Partial<PermissionRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await updateAgentKeyPermissionsAction({
      keyId,
      permissions: rows.map((r) => ({
        projectId: r.projectId,
        departmentId: r.departmentId,
        canRead: r.canRead,
        canCreate: r.canCreate,
        canUpdate: r.canUpdate,
        canAssign: r.canAssign,
      })),
    });

    if (result.success) {
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
      }, 2000);
    } else {
      setError(result.error ?? 'Failed to save permissions');
    }

    setSaving(false);
  }

  return (
    <div className="mt-4 space-y-4">
      {rows.length === 0 && !loading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No permissions configured. This key has no access to any projects.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2 text-center">Read</th>
                <th className="px-3 py-2 text-center">Create</th>
                <th className="px-3 py-2 text-center">Update</th>
                <th className="px-3 py-2 text-center">Assign</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Select
                      value={row.projectId}
                      onChange={(e) => {
                        const proj = projects.find((p) => p.id === e.target.value);
                        updateRow(i, {
                          projectId: e.target.value,
                          projectName: proj?.name ?? 'Unknown',
                        });
                      }}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={row.departmentId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const dept = departments.find((d) => d.id === val);
                        updateRow(i, {
                          departmentId: val,
                          departmentName: dept?.name ?? null,
                        });
                      }}
                    >
                      <option value="">All departments</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.canRead}
                      onChange={(e) => {
                        updateRow(i, { canRead: e.target.checked });
                      }}
                      aria-label={`Read access for ${row.projectName}${row.departmentName ? ` / ${row.departmentName}` : ''}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.canCreate}
                      onChange={(e) => {
                        updateRow(i, { canCreate: e.target.checked });
                      }}
                      aria-label={`Create access for ${row.projectName}${row.departmentName ? ` / ${row.departmentName}` : ''}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.canUpdate}
                      onChange={(e) => {
                        updateRow(i, { canUpdate: e.target.checked });
                      }}
                      aria-label={`Update access for ${row.projectName}${row.departmentName ? ` / ${row.departmentName}` : ''}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.canAssign}
                      onChange={(e) => {
                        updateRow(i, { canAssign: e.target.checked });
                      }}
                      aria-label={`Assign access for ${row.projectName}${row.departmentName ? ` / ${row.departmentName}` : ''}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        removeRow(i);
                      }}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      title="Remove"
                      aria-label={`Remove permission for ${row.projectName}${row.departmentName ? ` / ${row.departmentName}` : ''}`}
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={addRow} disabled={loading || projects.length === 0}>
          Add Permission
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Permissions'}
        </Button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
