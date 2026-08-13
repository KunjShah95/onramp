import { motion } from 'framer-motion'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 60, damping: 20 } },
}

const lineVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } },
}

export default function PhilosophyHero() {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative max-w-5xl mx-auto px-6 py-12 mb-20"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coding Agent Panel — the token burn */}
        <motion.div variants={panelVariants} className="rounded-card border border-abort/20 bg-abort/5 p-6 font-mono text-[13px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-abort/10">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-abort/60" />
              <div className="w-2 h-2 rounded-full bg-caution/60" />
              <div className="w-2 h-2 rounded-full bg-go/60" />
            </div>
            <span className="text-abort/70 text-[11px] ml-2">coding agent</span>
          </div>
          <div className="space-y-2">
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ codebase changed — re-reading repo…
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ read 250K tokens into context
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px]">
              → edits src/components/Button.tsx
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ npm test
            </motion.div>
            <motion.div variants={lineVariants} className="text-abort">
              Error: 3 tests failed
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ re-reading repo again… (250K tokens)
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ session ended — context gone
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-muted">
              $ tomorrow: re-read everything again
            </motion.div>
            <motion.div variants={lineVariants} className="text-abort">
              → tokens burned every single time
            </motion.div>
          </div>
        </motion.div>

        {/* Onramp Panel — Better Way */}
        <motion.div variants={panelVariants} className="rounded-card border border-go/30 bg-go/5 p-6 font-mono text-[13px] overflow-hidden">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-go/10">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-go/60" />
              <div className="w-2 h-2 rounded-full bg-go-lit/60" />
              <div className="w-2 h-2 rounded-full bg-go/40" />
            </div>
            <span className="text-go/70 text-[11px] ml-2">onramp</span>
          </div>
          <div className="space-y-2">
            <motion.div variants={lineVariants} className="text-go font-semibold">
              Ask: "How do I set up this repo?"
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Indexed already — reading the graph
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Found 3 entry points: setup.rs, build.sh, deploy.py
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Codebase changed? Re-embed the diff, update the graph
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px] leading-relaxed">
              <span className="text-go">→</span> Found module gap: deploy.py needs boto3
            </motion.div>
            <motion.div variants={lineVariants} className="mt-3 pt-2 border-t border-go/10 text-go-lit font-semibold">
              Start with: npm install && python -m pip install boto3
            </motion.div>
            <motion.div variants={lineVariants} className="text-ink-secondary text-[12px]">
              <span className="text-go">→</span> Graph persists — no re-read, no token burn
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
