'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createAgentKeyAction } from '@/app/(dashboard)/actions/agent-key-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface AgentKeyFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function AgentKeyForm({ onClose, onSuccess }: AgentKeyFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await createAgentKeyAction(formData);

    if (result.success && result.data) {
      setCreatedKey(result.data.fullKey);
      toast.success('Agent key created');
      onSuccess?.();
    } else {
      toast.error(result.error ?? 'Failed to create key');
    }

    setLoading(false);
  }

  async function handleCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: use a temporary textarea for older browsers / non-HTTPS
      try {
        const textarea = document.createElement('textarea');
        textarea.value = createdKey;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Last resort: prompt user to copy manually
        window.prompt('Copy this key:', createdKey);
      }
    }
  }

  if (createdKey) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
          Copy this key now. It won&apos;t be shown again.
        </div>
        <div className="relative rounded-lg bg-slate-900 p-4 dark:bg-slate-950">
          <code className="block break-all font-mono text-base text-green-400">{createdKey}</code>
          <button
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded-md bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="agent-key-name"
        name="name"
        label="Name"
        placeholder="e.g. Content Writer Bot"
        required
        autoFocus
      />
      <Select id="agent-key-role" name="role" label="Role">
        <option value="worker">Worker</option>
        <option value="manager">Manager</option>
      </Select>
      <div className="space-y-1">
        <label
          htmlFor="agent-key-prompt"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Special Prompt (optional)
        </label>
        <textarea
          id="agent-key-prompt"
          name="specialPrompt"
          rows={3}
          placeholder="Extra instructions for this agent..."
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Key'}
        </Button>
      </div>
    </form>
  );
}
