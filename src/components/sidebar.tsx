'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProjectForm } from '@/components/project-form'
import { DepartmentForm } from '@/components/department-form'
import { updateProjectAction } from '@/app/(dashboard)/actions/project-actions'
import { updateDepartmentAction } from '@/app/(dashboard)/actions/department-actions'

interface Project {
  id: string
  name: string
  is_archived: boolean
}

interface Department {
  id: string
  name: string
  is_archived: boolean
}

interface SidebarProps {
  userEmail?: string
}

const navLinks = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/agent-keys', label: 'Agent Keys' },
]

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mobileOpen, setMobileOpen] = useState(false)

  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)

  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null)
  const [editingDepartment, setEditingDepartment] = useState<{ id: string; name: string } | null>(null)

  const selectedProject = searchParams.get('project') ?? ''
  const selectedDepartment = searchParams.get('department') ?? ''

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const json = await res.json()
        setProjects(json.data ?? [])
      }
    } catch {
      // API may not be ready yet — fail silently
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (res.ok) {
        const json = await res.json()
        setDepartments(json.data ?? [])
      }
    } catch {
      // API may not be ready yet — fail silently
    }
  }, [])

  useEffect(() => {
    fetchProjects()
    fetchDepartments()
  }, [fetchProjects, fetchDepartments])

  function setSearchParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleRenameProject(id: string, newName: string) {
    const formData = new FormData()
    formData.set('id', id)
    formData.set('name', newName)
    const result = await updateProjectAction(formData)
    if (result.success) {
      toast.success('Project renamed')
      setEditingProject(null)
      fetchProjects()
    } else {
      toast.error(result.error ?? 'Failed to rename project')
    }
  }

  async function handleArchiveProject(id: string) {
    const formData = new FormData()
    formData.set('id', id)
    formData.set('isArchived', 'true')
    const result = await updateProjectAction(formData)
    if (result.success) {
      toast.success('Project archived')
      if (selectedProject === id) {
        setSearchParam('project', '')
      }
      fetchProjects()
    } else {
      toast.error(result.error ?? 'Failed to archive project')
    }
  }

  async function handleRenameDepartment(id: string, newName: string) {
    const formData = new FormData()
    formData.set('id', id)
    formData.set('name', newName)
    const result = await updateDepartmentAction(formData)
    if (result.success) {
      toast.success('Department renamed')
      setEditingDepartment(null)
      fetchDepartments()
    } else {
      toast.error(result.error ?? 'Failed to rename department')
    }
  }

  async function handleArchiveDepartment(id: string) {
    const formData = new FormData()
    formData.set('id', id)
    formData.set('isArchived', 'true')
    const result = await updateDepartmentAction(formData)
    if (result.success) {
      toast.success('Department archived')
      if (selectedDepartment === id) {
        setSearchParam('department', '')
      }
      fetchDepartments()
    } else {
      toast.error(result.error ?? 'Failed to archive department')
    }
  }

  const activeProjects = projects.filter((p) => !p.is_archived)
  const activeDepartments = departments.filter((d) => !d.is_archived)

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4">
        <span className="text-lg font-bold tracking-tight">WritBase</span>
        <button
          className="text-slate-400 hover:text-white md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          &times;
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-4 space-y-1 px-3">
        {navLinks.map((link) => {
          const isActive = pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* Selectors */}
      <div className="mt-6 space-y-4 px-3">
        {/* Project selector */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Project
            </label>
            <button
              onClick={() => setShowProjectModal(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add
            </button>
          </div>
          {activeProjects.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              No projects yet. Click &quot;+ Add&quot; to create your first project.
            </p>
          ) : (
            <select
              value={selectedProject}
              onChange={(e) => setSearchParam('project', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All projects</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Project management list */}
        {activeProjects.length > 0 && (
          <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
            {activeProjects.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                <span className="truncate">{p.name}</span>
                <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditingProject({ id: p.id, name: p.name })}
                    className="text-slate-400 hover:text-blue-400"
                    aria-label={`Rename ${p.name}`}
                    title="Rename"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleArchiveProject(p.id)}
                    className="text-slate-400 hover:text-red-400"
                    aria-label={`Archive ${p.name}`}
                    title="Archive"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Department selector */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Department
            </label>
            <button
              onClick={() => setShowDepartmentModal(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + Add
            </button>
          </div>
          <select
            value={selectedDepartment}
            onChange={(e) => setSearchParam('department', e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All departments</option>
            {activeDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Department management list */}
        {activeDepartments.length > 0 && (
          <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
            {activeDepartments.map((d) => (
              <div
                key={d.id}
                className="group flex items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                <span className="truncate">{d.name}</span>
                <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => setEditingDepartment({ id: d.id, name: d.name })}
                    className="text-slate-400 hover:text-blue-400"
                    aria-label={`Rename ${d.name}`}
                    title="Rename"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleArchiveDepartment(d.id)}
                    className="text-slate-400 hover:text-red-400"
                    aria-label={`Archive ${d.name}`}
                    title="Archive"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User / Sign out */}
      <div className="border-t border-slate-700 px-4 py-4">
        {userEmail && (
          <p className="mb-2 truncate text-xs text-slate-400">{userEmail}</p>
        )}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-center text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Sign out
        </Button>
      </div>

      {/* Modals */}
      <Modal
        open={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        title="New Project"
      >
        <ProjectForm
          onClose={() => setShowProjectModal(false)}
          onSuccess={() => fetchProjects()}
        />
      </Modal>

      <Modal
        open={showDepartmentModal}
        onClose={() => setShowDepartmentModal(false)}
        title="New Department"
      >
        <DepartmentForm
          onClose={() => setShowDepartmentModal(false)}
          onSuccess={() => fetchDepartments()}
        />
      </Modal>

      {/* Rename Project Modal */}
      <Modal
        open={editingProject !== null}
        onClose={() => setEditingProject(null)}
        title="Rename Project"
      >
        {editingProject && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleRenameProject(editingProject.id, editingProject.name)
            }}
            className="space-y-4"
          >
            <Input
              id="rename-project"
              label="Project Name"
              value={editingProject.name}
              onChange={(e) =>
                setEditingProject({ ...editingProject, name: e.target.value })
              }
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setEditingProject(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editingProject.name.trim()}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Rename Department Modal */}
      <Modal
        open={editingDepartment !== null}
        onClose={() => setEditingDepartment(null)}
        title="Rename Department"
      >
        {editingDepartment && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleRenameDepartment(editingDepartment.id, editingDepartment.name)
            }}
            className="space-y-4"
          >
            <Input
              id="rename-department"
              label="Department Name"
              value={editingDepartment.name}
              onChange={(e) =>
                setEditingDepartment({ ...editingDepartment, name: e.target.value })
              }
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setEditingDepartment(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editingDepartment.name.trim()}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-md bg-slate-900 p-2 text-white md:hidden"
        aria-label="Open menu"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[250px] transform transition-transform md:relative md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
