'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createDepartmentAction } from '@/app/(dashboard)/actions/department-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DepartmentFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function DepartmentForm({ onClose, onSuccess }: DepartmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createDepartmentAction(formData);

    if (result.success) {
      toast.success('Department created');
      onSuccess?.();
      onClose();
    } else {
      toast.error(result.error ?? 'Failed to create department');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="department-name"
        name="name"
        label="Department Name"
        placeholder="Enter department name"
        required
        autoFocus
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Department'}
        </Button>
      </div>
    </form>
  );
}
