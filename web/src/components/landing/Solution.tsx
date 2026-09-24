import ArchitectureMapStatic from './ArchitectureMapStatic'
import SectionHeading from './SectionHeading'

/* Calm solution section — one bordered panel, static map, plain
 * feature list below. Removed: radial glow, overlay callouts,
 * scroll-triggered rise, dark-only window chrome. */

const POINTS = [
  { label: 'Every service indexed', note: 'from source, not docs' },
  { label: 'Dependencies mapped', note: 'drawn as a live graph' },
  { label: 'Ownership visible', note: 'who owns what, always' },
  { label: 'Updated on every push', note: 'fresh from HEAD' },
]

export default function Solution() {
  return (
    <section id="the-map" className="landing-section scroll-mt-20 border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="The product"
          heading={<>One GitHub App. Instant clarity.</>}
          sub="Onramp parses your services, dependencies, and ownership straight from source. The map is the source of truth. It builds itself from HEAD and stays fresh on every push."
        />

        <div className="mt-10 overflow-hidden rounded-md border border-seam bg-panel">
          <div className="flex items-center justify-between border-b border-seam px-4 py-2.5">
            <span className="font-code text-xs text-ink-tertiary">Architecture map</span>
            <span className="font-code text-xs text-ink-tertiary">fresh from HEAD</span>
          </div>
          <div className="h-[380px] sm:h-[440px]">
            <ArchitectureMapStatic className="h-full w-full" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map((p) => (
            <div key={p.label} className="rounded-md border border-seam bg-panel px-4 py-3">
              <div className="text-sm font-medium text-ink">{p.label}</div>
              <div className="mt-0.5 font-code text-xs text-ink-tertiary">{p.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}