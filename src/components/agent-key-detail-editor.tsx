'use client'

import { useState } from 'react'
import { updateAgentKeyAction } from '@/app/(dashboard)/actions/agent-key-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AgentKeyDetailEditorProps {
  keyId: string
  initialName: string
  initialPrompt: string
  initialActive: boolean
}

export function AgentKeyDetailEditor({
  keyId,
  initialName,
  initialPrompt,
  initialActive,
}: AgentKeyDetailEditorProps) {
  const [name, setName] = useState(initialName)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [isActive, setIsActive] = useState(initialActive)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSaved(false)

    const formData = new FormData()
    formData.set('id', keyId)
    formData.set('name', name)
    formData.set('specialPrompt', prompt)
    formData.set('isActive', String(isActive))

    const result = await updateAgentKeyAction(formData)

    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error ?? 'Failed to update')
    }

    setLoading(false)
  }

  return (
    <div className="mt-4 space-y-4">
      <Input
        id="key-name"
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
          onChange={(e) => setPrompt(e.target.value)}
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
          onClick={() => setIsActive(!isActive)}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">
            Saved!
          </span>
        )}
      </div>
    </div>
  )
}
