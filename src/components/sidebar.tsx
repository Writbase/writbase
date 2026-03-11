'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { updateDepartmentAction } from '@/app/(dashboard)/actions/department-actions';
import { updateProjectAction } from '@/app/(dashboard)/actions/project-actions';
import { SidebarDepartmentSelector } from '@/components/sidebar-department-selector';
import { SidebarModals } from '@/components/sidebar-modals';
import { SidebarProjectSelector } from '@/components/sidebar-project-selector';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Project {
  id: string;
  name: string;
  is_archived: boolean;
}

interface Department {
  id: string;
  name: string;
  is_archived: boolean;
}

interface SidebarProps {
  userEmail?: string;
}

const navLinks = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/agent-keys', label: 'Agent Keys' },
];

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);

  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<{ id: string; name: string } | null>(
    null,
  );

  const selectedProject = searchParams.get('project') ?? '';
  const selectedDepartment = searchParams.get('department') ?? '';

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const json = (await res.json()) as { data?: Project[] };
        setProjects(json.data ?? []);
      }
    } catch {
      // API may not be ready yet — fail silently
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const json = (await res.json()) as { data?: Department[] };
        setDepartments(json.data ?? []);
      }
    } catch {
      // API may not be ready yet — fail silently
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState in async fetch callbacks is intentional
    void fetchProjects();
    void fetchDepartments();
  }, [fetchProjects, fetchDepartments]);

  function setSearchParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleRenameProject(id: string, newName: string) {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('name', newName);
    const result = await updateProjectAction(formData);
    if (result.success) {
      toast.success('Project renamed');
      setEditingProject(null);
      fetchProjects();
    } else {
      toast.error(result.error ?? 'Failed to rename project');
    }
  }

  async function handleArchiveProject(id: string) {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('isArchived', 'true');
    const result = await updateProjectAction(formData);
    if (result.success) {
      toast.success('Project archived');
      if (selectedProject === id) {
        setSearchParam('project', '');
      }
      fetchProjects();
    } else {
      toast.error(result.error ?? 'Failed to archive project');
    }
  }

  async function handleRenameDepartment(id: string, newName: string) {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('name', newName);
    const result = await updateDepartmentAction(formData);
    if (result.success) {
      toast.success('Department renamed');
      setEditingDepartment(null);
      fetchDepartments();
    } else {
      toast.error(result.error ?? 'Failed to rename department');
    }
  }

  async function handleArchiveDepartment(id: string) {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('isArchived', 'true');
    const result = await updateDepartmentAction(formData);
    if (result.success) {
      toast.success('Department archived');
      if (selectedDepartment === id) {
        setSearchParam('department', '');
      }
      fetchDepartments();
    } else {
      toast.error(result.error ?? 'Failed to archive department');
    }
  }

  const activeProjects = projects.filter((p) => !p.is_archived);
  const activeDepartments = departments.filter((d) => !d.is_archived);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4">
        <span className="text-lg font-bold tracking-tight">WritBase</span>
        <button
          className="text-slate-400 hover:text-white md:hidden"
          onClick={() => {
            setMobileOpen(false);
          }}
          aria-label="Close menu"
        >
          &times;
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-4 space-y-1 px-3">
        {navLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => {
                setMobileOpen(false);
              }}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Selectors */}
      <div className="mt-6 space-y-4 px-3">
        <SidebarProjectSelector
          activeProjects={activeProjects}
          selectedProject={selectedProject}
          onSelectProject={(id) => {
            setSearchParam('project', id);
          }}
          onAddProject={() => {
            setShowProjectModal(true);
          }}
          onEditProject={setEditingProject}
          onArchiveProject={handleArchiveProject}
        />

        <SidebarDepartmentSelector
          activeDepartments={activeDepartments}
          selectedDepartment={selectedDepartment}
          onSelectDepartment={(id) => {
            setSearchParam('department', id);
          }}
          onAddDepartment={() => {
            setShowDepartmentModal(true);
          }}
          onEditDepartment={setEditingDepartment}
          onArchiveDepartment={handleArchiveDepartment}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User / Sign out */}
      <div className="border-t border-slate-700 px-4 py-4">
        {userEmail && <p className="mb-2 truncate text-xs text-slate-400">{userEmail}</p>}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-center text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Sign out
        </Button>
      </div>

      {/* Modals */}
      <SidebarModals
        showProjectModal={showProjectModal}
        onCloseProjectModal={() => {
          setShowProjectModal(false);
        }}
        onProjectCreated={() => {
          void fetchProjects();
        }}
        showDepartmentModal={showDepartmentModal}
        onCloseDepartmentModal={() => {
          setShowDepartmentModal(false);
        }}
        onDepartmentCreated={() => {
          void fetchDepartments();
        }}
        editingProject={editingProject}
        onCloseEditProject={() => {
          setEditingProject(null);
        }}
        onRenameProject={handleRenameProject}
        editingDepartment={editingDepartment}
        onCloseEditDepartment={() => {
          setEditingDepartment(null);
        }}
        onRenameDepartment={handleRenameDepartment}
      />
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => {
          setMobileOpen(true);
        }}
        className="fixed left-4 top-4 z-40 rounded-md bg-slate-900 p-2 text-white md:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          onClick={() => {
            setMobileOpen(false);
          }}
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
  );
}
