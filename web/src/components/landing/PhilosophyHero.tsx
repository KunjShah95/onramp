



export default function PhilosophyHero() {
  return (
    <div className="relative max-w-5xl mx-auto px-6 py-12 mb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coding Agent Panel — the token burn */}
        <div className="rounded-card border border-abort/20 bg-abort/5 p-6 font-mono text-[13px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-abort/10">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-abort/60" />
              <div className="w-2 h-2 rounded-full bg-caution/60" />
              <div className="w-2 h-2 rounded-full bg-go/60" />
            </div>
            <span className="text-abort/70 text-[11px] ml-2">coding agent</span>
          </div>
          <div className="space-y-2">
            <div className="text-ink-secondary">
              $ codebase changed · re-reading repo…
            </div>
            <div className="text-ink-secondary">
              $ read 250K tokens into context
            </div>
            <div className="text-ink-secondary text-[12px]">
              → edits src/components/Button.tsx
            </div>
            <div className="text-ink-secondary">
              $ npm test
            </div>
            <div className="text-abort">
              Error: 3 tests failed
            </div>
            <div className="text-ink-secondary">
              $ re-reading repo again… (250K tokens)
            </div>
            <div className="text-ink-secondary">
              $ session ended · context gone
            </div>
            <div className="text-ink-secondary">
              $ tomorrow: re-read everything again
            </div>
            <div className="text-abort">
              → tokens burned every single time
            </div>
          </div>
        </div>

        {/* Onramp Panel — Better Way */}
        <div className="rounded-card border border-go/30 bg-go/5 p-6 font-mono text-[13px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-go/10">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-go/60" />
              <div className="w-2 h-2 rounded-full bg-go-lit/60" />
              <div className="w-2 h-2 rounded-full bg-go/40" />
            </div>
            <span className="text-go/70 text-[11px] ml-2">onramp</span>
          </div>
          <div className="space-y-2">
            <div className="text-go font-semibold">
              Ask: "How do I set up this repo?"
            </div>
            <div className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Indexed already · reading the graph
            </div>
            <div className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Found 3 entry points: setup.rs, build.sh, deploy.py
            </div>
            <div className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Codebase changed? Re-embed the diff, update the graph
            </div>
            <div className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Found module gap: deploy.py needs boto3
            </div>
            <div className="mt-3 pt-2 border-t border-go/10 text-go-lit font-semibold">
              Start with: npm install && python -m pip install boto3
            </div>
            <div className="text-ink-secondary text-[12px]">
              <span className="text-go">→</span> Graph persists · no re-read, no token burn
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
