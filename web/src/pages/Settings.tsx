import { useState, useEffect } from 'react'
import { SettingsSkeleton } from '../components/ui/Skeleton'

export default function Settings() {
  const [llmProvider, setLlmProvider] = useState('openai')
  const [llmEnabled, setLlmEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  if (loading) return <SettingsSkeleton />

  return (
    <div className="animate-in max-w-lg">
      <h1 className="font-display text-2xl font-bold text-text-primary">Settings</h1>

      <div className="mt-8 space-y-6">
        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">LLM Configuration</h3>
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input type="checkbox" checked={llmEnabled} onChange={e => setLlmEnabled(e.target.checked)} className="accent-accent-from" />
              Enable LLM features
            </label>
            <div>
              <label className="block mb-2 text-text-secondary text-sm">Provider</label>
              <select value={llmProvider} onChange={e => setLlmProvider(e.target.value)} className="input">
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">API Keys</h3>
          <div className="mt-4">
            <label className="block mb-2 text-text-secondary text-sm">OpenAI API Key</label>
            <input type="password" placeholder="sk-..." className="input w-full" />
          </div>
        </div>

        <button className="btn">Save Settings</button>
      </div>
    </div>
  )
}
