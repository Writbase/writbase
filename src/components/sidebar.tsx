'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ProjectForm } from '@/components/project-form'
import { DepartmentForm } from '@/components/department-form'

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
