'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  rotateAgentKeyAction,
  updateAgentKeyAction,
} from '@/app/(dashboard)/actions/agent-key-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

interface AgentKeyDetailEditorProps {
  keyId: string;
  initialName: string;
  initialPrompt: string;
  initialActive: boolean;
}

export function AgentKeyDetailEditor({
  keyId,
  initialName,
  initialPrompt,
  initialActive,
}: AgentKeyDetailEditorProps) {
  const [name, setName] = useState(initialName);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isActive, setIsActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleRotate() {
    setRotating(true);
    const result = await rotateAgentKeyAction(keyId);
    if (result.success && result.data) {
      setNewKey(result.data.fullKey);
      setShowRotateConfirm(false);
      toast.success('Key rotated successfully');
    } else {
      toast.error(result.error ?? 'Failed to rotate key');
    }
    setRotating(false);
  }

  async function handleCopyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    toast.success('Key copied to clipboard');
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  async function handleSave() {
    setLoading(true);

    const formData = new FormData();
    formData.set('id', keyId);
    formData.set('name', name);
    formData.set('specialPrompt', prompt);
    formData.set('isActive', String(isActive));

    const result = await updateAgentKeyAction(formData);

    if (result.success) {
      toast.success('Changes saved');
    } else {
      toast.error(result.error ?? 'Failed to update');
    }

    setLoading(false);
  }

  return (
    <div className="mt-4 space-y-4">
      <Input
        id="key-name"
        label="Name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <div className="space-y-1">
        <label
          htmlFor="key-prompt"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Special Prompt
        </label>
        <textarea
          id="key-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Extra instructions for this agent..."
        />
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor="key-active"
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Active
        </label>
        <button
          id="key-active"
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => {
            setIsActive(!isActive);
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              isActive ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Key rotation */}
      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Key Rotation</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Generate a new secret for this agent key. The current key will stop working immediately.
        </p>

        {newKey ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Store this key securely. It will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 overflow-x-auto rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                {newKey}
              </code>
              <Button variant="secondary" onClick={handleCopyKey}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="danger"
            className="mt-3"
            onClick={() => {
              setShowRotateConfirm(true);
            }}
          >
            Rotate Key
          </Button>
        )}
      </div>

      {/* Rotate confirmation modal */}
      <Modal
        open={showRotateConfirm}
        onClose={() => {
          setShowRotateConfirm(false);
        }}
        title="Rotate Agent Key"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure? The current key will stop working immediately. Any agents using this key
            will need to be updated with the new secret.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowRotateConfirm(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRotate} disabled={rotating}>
              {rotating ? 'Rotating...' : 'Rotate Key'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
