'use client';

import { useState } from 'react';
import { DepartmentForm } from '@/components/department-form';
import { ProjectForm } from '@/components/project-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

interface SidebarModalsProps {
  showProjectModal: boolean;
  onCloseProjectModal: () => void;
  onProjectCreated: () => void;
  showDepartmentModal: boolean;
  onCloseDepartmentModal: () => void;
  onDepartmentCreated: () => void;
  editingProject: { id: string; name: string } | null;
  onCloseEditProject: () => void;
  onRenameProject: (id: string, name: string) => void;
  editingDepartment: { id: string; name: string } | null;
  onCloseEditDepartment: () => void;
  onRenameDepartment: (id: string, name: string) => void;
}

function RenameForm({
  id,
  inputId,
  label,
  initialName,
  onCancel,
  onSubmit,
}: {
  id: string;
  inputId: string;
  label: string;
  initialName: string;
  onCancel: () => void;
  onSubmit: (id: string, name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(id, name);
      }}
      className="space-y-4"
    >
      <Input
        id={inputId}
        label={label}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function SidebarModals({
  showProjectModal,
  onCloseProjectModal,
  onProjectCreated,
  showDepartmentModal,
  onCloseDepartmentModal,
  onDepartmentCreated,
  editingProject,
  onCloseEditProject,
  onRenameProject,
  editingDepartment,
  onCloseEditDepartment,
  onRenameDepartment,
}: SidebarModalsProps) {
  return (
    <>
      {/* New Project Modal */}
      <Modal open={showProjectModal} onClose={onCloseProjectModal} title="New Project">
        <ProjectForm onClose={onCloseProjectModal} onSuccess={onProjectCreated} />
      </Modal>

      {/* New Department Modal */}
      <Modal open={showDepartmentModal} onClose={onCloseDepartmentModal} title="New Department">
        <DepartmentForm onClose={onCloseDepartmentModal} onSuccess={onDepartmentCreated} />
      </Modal>

      {/* Rename Project Modal */}
      <Modal open={editingProject !== null} onClose={onCloseEditProject} title="Rename Project">
        {editingProject && (
          <RenameForm
            key={editingProject.id}
            id={editingProject.id}
            inputId="rename-project"
            label="Project Name"
            initialName={editingProject.name}
            onCancel={onCloseEditProject}
            onSubmit={onRenameProject}
          />
        )}
      </Modal>

      {/* Rename Department Modal */}
      <Modal
        open={editingDepartment !== null}
        onClose={onCloseEditDepartment}
        title="Rename Department"
      >
        {editingDepartment && (
          <RenameForm
            key={editingDepartment.id}
            id={editingDepartment.id}
            inputId="rename-department"
            label="Department Name"
            initialName={editingDepartment.name}
            onCancel={onCloseEditDepartment}
            onSubmit={onRenameDepartment}
          />
        )}
      </Modal>
    </>
  );
}
