import { useState, useEffect } from 'react'
import { SettingsSkeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'

export default function Settings() {
  const [llmProvider, setLlmProvider] = useState('openai')
  const [llmEnabled, setLlmEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  // Slack Integration states
  const [slackWebhook, setSlackWebhook] = useState('')
  const [slackChannel, setSlackChannel] = useState('#general')
  const [digestRepo, setDigestRepo] = useState('')
  const [slackLoading, setSlackLoading] = useState(false)
  const [slackStatus, setSlackStatus] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  async function handleSendSlackDigest() {
    if (!slackWebhook.trim() || !digestRepo.trim()) return
    setSlackLoading(true)
    setSlackStatus('')
    try {
      const res = await fetch('http://localhost:8000/api/v1/slack/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: digestRepo.trim(),
          webhook_url: slackWebhook.trim(),
          channel: slackChannel.trim() || '#general',
          user_level: 'junior',
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text)
      }
      const data = await res.json()
      if (data.sent) {
        setSlackStatus(`Success! Sent digest with ${data.issue_count} good-first-issues to ${slackChannel}.`)
      } else {
        setSlackStatus('Failed to post message to Slack.')
      }
    } catch (e) {
      setSlackStatus(e instanceof Error ? `Error: ${e.message}` : 'Error sending digest')
    }
    setSlackLoading(false)
  }

  if (loading) return <SettingsSkeleton />

  return (
    <div className="animate-in max-w-lg pb-12">
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

        <div className="card">
          <h3 className="font-display text-base font-semibold text-text-primary">Slack Integration</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block mb-1 text-text-secondary text-xs">Slack Webhook URL</label>
              <input
                type="text"
                placeholder="https://hooks.slack.com/services/..."
                value={slackWebhook}
                onChange={e => setSlackWebhook(e.target.value)}
                className="input w-full text-xs"
              />
            </div>
            <div>
              <label className="block mb-1 text-text-secondary text-xs">Digest Target Channel</label>
              <input
                type="text"
                placeholder="#general"
                value={slackChannel}
                onChange={e => setSlackChannel(e.target.value)}
                className="input w-full text-xs"
              />
            </div>
            <div>
              <label className="block mb-1 text-text-secondary text-xs">Repository to digest</label>
              <input
                type="text"
                placeholder="https://github.com/owner/repo"
                value={digestRepo}
                onChange={e => setDigestRepo(e.target.value)}
                className="input w-full text-xs"
              />
            </div>
            <div className="pt-2">
              <button
                onClick={handleSendSlackDigest}
                disabled={slackLoading || !slackWebhook.trim() || !digestRepo.trim()}
                className="btn btn-ghost text-xs py-1.5 px-3 whitespace-nowrap disabled:opacity-50"
              >
                {slackLoading ? 'Sending...' : 'Test: Send Good-First-Issues Digest'}
              </button>
            </div>
            {slackStatus && (
              <p className={cn("text-xs mt-2 font-mono", slackStatus.includes("Error") || slackStatus.includes("Failed") ? "text-red-400" : "text-green-400")}>
                {slackStatus}
              </p>
            )}
          </div>
        </div>

        <button className="btn">Save Settings</button>
      </div>
    </div>
  )
}
