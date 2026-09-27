import type { ReactNode } from 'react'
import { ArrowBendDownRight, GitPullRequest, Warning } from '@phosphor-icons/react'
import ArchitectureMapStatic from './ArchitectureMapStatic'
import { Section, SectionHeader } from '../marketing/primitives'
import { cn } from '../../lib/utils'

/* What Onramp builds from one repo. Six-column bento: 4+2, 2+2+2, 6.
 * Every row fills; each cell has one hover reward. */

function Cell({
  label,
  title,
  body,
  children,
  className,
}: {
  label: string
  title: string
  body: string
  children?: ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'mk-card group flex flex-col overflow-hidden transition-[border-color] duration-200 hover:border-seam-strong',
        className,
      )}
    >
      <div className="p-6 pb-0">
        <span className="mk-label">{label}</span>
        <h3 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-ink">{title}</h3>
        <p className="mt-2 max-w-md text-[14.5px] leading-[1.6] text-ink-secondary">{body}</p>
      </div>
      {children && <div className="mt-auto pt-6">{children}</div>}
    </article>
  )
}

function IssueRow({ n, title, size }: { n: number; title: string; size: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-seam bg-room px-3 py-2 transition-transform duration-200 group-hover:translate-x-1">
      <span className="font-code text-[11px] text-ink-tertiary">#{n}</span>
      <span className="truncate text-[13px] text-ink">{title}</span>
      <span className="ml-auto shrink-0 font-code text-[10.5px] text-go">{size}</span>
    </div>
  )
}

export default function ProductBento() {
  return (
    <Section id="product">
      <SectionHeader
        label="The product"
        title="One repo in. A complete ramp out."
        lede="Connect a repository and Onramp builds everything a new engineer needs from the code itself. When the code changes, all of it changes with it."
      />

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
        <Cell
          className="md:col-span-4"
          label="Architecture map"
          title="See the whole system before touching a file."
          body="Services, dependencies and ownership, parsed from source and redrawn on every push. It never describes last quarter's architecture."
        >
          <div className="h-[260px] border-t border-seam transition-opacity duration-200 group-hover:opacity-100 sm:h-[300px] sm:opacity-90">
            <ArchitectureMapStatic className="h-full w-full" />
          </div>
        </Cell>

        <Cell
          className="md:col-span-2"
          label="Ask"
          title="The question they were too shy to ask twice."
          body="Answers come from your indexed code, not the open internet, so they name your files and your functions."
        >
          <div className="space-y-2 px-6 pb-6">
            <div className="rounded-lg bg-well px-3 py-2 text-[13px] text-ink">Who calls the auth service?</div>
            <div className="flex gap-2 rounded-lg border border-seam px-3 py-2 text-[13px] leading-relaxed text-ink-secondary transition-colors duration-200 group-hover:border-go/40">
              <ArrowBendDownRight size={14} className="mt-0.5 shrink-0 text-go" />
              <span>
                The gateway and webhooks, via <code className="font-code text-[12px] text-ink">auth/client.ts</code>
              </span>
            </div>
          </div>
        </Cell>

        <Cell
          className="md:col-span-2"
          label="Learning paths"
          title="A curriculum written by the codebase."
          body="Pick a level and get modules drawn from real code, each with a short quiz. Turn the path into tracked tasks in one click."
        >
          <div className="px-6 pb-6">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink-secondary">Backend path</span>
              <span className="font-code tabular-nums text-ink">3 / 5</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well">
              <div className="h-full w-[60%] rounded-full bg-go transition-[width] duration-500 group-hover:w-[80%]" />
            </div>
          </div>
        </Cell>

        <Cell
          className="md:col-span-2"
          label="First issues"
          title="Real work, sized for day three."
          body="Onramp finds issues a newcomer can finish, then walks them through the files they'll touch."
        >
          <div className="space-y-1.5 px-6 pb-6">
            <IssueRow n={412} title="Add retry to invoice webhook" size="small" />
            <IssueRow n={398} title="Typo in refund email template" size="tiny" />
          </div>
        </Cell>

        <Cell
          className="md:col-span-2"
          label="Tasks and review"
          title="Seniors review in one queue, not five tabs."
          body="Assign, submit, review, approve. Every pending PR from every new hire sits in one list with its context."
        >
          <div className="px-6 pb-6">
            <div className="flex items-center gap-2.5 rounded-lg border border-seam bg-room px-3 py-2">
              <GitPullRequest size={14} className="text-go" />
              <span className="text-[13px] text-ink">Retry invoice webhook</span>
              <span className="ml-auto font-code text-[10.5px] text-ink-tertiary transition-colors group-hover:text-go">
                approve
              </span>
            </div>
          </div>
        </Cell>

        <Cell
          className="md:col-span-6"
          label="Ramp dashboard"
          title="Know who is stuck on Tuesday, not at the Friday one-on-one."
          body="Onramp watches for stalled tasks, review loops and silent weeks, then tells the lead. It also puts a number on the senior time each ramp consumes, so onboarding finally shows up in planning."
        >
          <div className="grid grid-cols-1 gap-px border-t border-seam bg-seam sm:grid-cols-3">
            {[
              { k: 'Time to first merged PR', v: 'tracked per hire' },
              { k: 'Review loops', v: '2+ change requests flagged' },
              { k: 'Stalled tasks', v: 'untouched 5 days, flagged' },
            ].map((s) => (
              <div key={s.k} className="bg-panel px-6 py-5">
                <div className="text-[14px] text-ink">{s.k}</div>
                <div className="mt-1 flex items-center gap-1.5 font-code text-[11.5px] text-ink-tertiary">
                  {s.k === 'Review loops' && <Warning size={12} className="text-caution" />}
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </Cell>
      </div>
    </Section>
  )
}
