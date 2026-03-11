'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createProjectAction } from '@/app/(dashboard)/actions/project-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProjectForm({ onClose, onSuccess }: ProjectFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createProjectAction(formData);

    if (result.success) {
      toast.success('Project created');
      onSuccess?.();
      onClose();
    } else {
      toast.error(result.error ?? 'Failed to create project');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="project-name"
        name="name"
        label="Project Name"
        placeholder="Enter project name"
        required
        autoFocus
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
