import { useEffect } from 'react'

/*
 * Lightweight per-page SEO — no external dependency.
 *
 * Each page renders `<Seo title="…" description="…" path="/pricing" />` and
 * this component writes the document title plus meta/canonical/OG/Twitter
 * tags into <head> on mount. Tags carry a `data-seo` attribute so they are
 * updated in place (no duplicates accumulate on navigation), and pages that
 * don't render <Seo> keep the static defaults from index.html.
 */

const BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '') || 'https://onramp.app'

const DEFAULT_IMAGE = `${BASE}/og-image.png`

export interface SeoProps {
  title: string
  description?: string
  /** Canonical path, e.g. `/pricing`. Defaults to `/`. */
  path?: string
  type?: 'website' | 'article'
  image?: string
  /** Exclude the page from search engines (auth pages, app shell). */
  noindex?: boolean
}

/** Upsert a tag identified by `data-seo="key"` — creates it if missing. */
function upsertTag(key: string, tag: 'meta' | 'link', attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLElement>(`[data-seo="${key}"]`)
  if (!el) {
    el = document.createElement(tag)
    el.setAttribute('data-seo', key)
    document.head.appendChild(el)
  }
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
}

export default function Seo({
  title,
  description,
  path = '/',
  type = 'website',
  image = DEFAULT_IMAGE,
  noindex = false,
}: SeoProps) {
  useEffect(() => {
    const url = `${BASE}${path === '/' ? '/' : path}`
    const desc = description ?? ''

    document.title = title
    upsertTag('description', 'meta', { name: 'description', content: desc })
    upsertTag('canonical', 'link', { rel: 'canonical', href: url })

    // Open Graph
    upsertTag('og:title', 'meta', { property: 'og:title', content: title })
    upsertTag('og:description', 'meta', { property: 'og:description', content: desc })
    upsertTag('og:type', 'meta', { property: 'og:type', content: type })
    upsertTag('og:url', 'meta', { property: 'og:url', content: url })
    upsertTag('og:image', 'meta', { property: 'og:image', content: image })

    // Twitter card
    upsertTag('twitter:card', 'meta', { name: 'twitter:card', content: 'summary_large_image' })
    upsertTag('twitter:title', 'meta', { name: 'twitter:title', content: title })
    upsertTag('twitter:description', 'meta', { name: 'twitter:description', content: desc })
    upsertTag('twitter:image', 'meta', { name: 'twitter:image', content: image })

    // Robots
    upsertTag('robots', 'meta', {
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    })
  }, [title, description, path, type, image, noindex])

  return null
}
