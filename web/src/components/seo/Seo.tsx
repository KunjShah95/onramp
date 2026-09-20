import { useEffect } from 'react'

/*
 * Lightweight per-page SEO — no external dependency.
 *
 * Each page renders `<Seo title="…" description="…" path="/pricing" />` and
 * this component writes the document title plus meta/canonical/OG/Twitter
 * tags into <head> on mount. Tags carry a `data-seo` attribute so they are
 * updated in place (no duplicates accumulate on navigation), and pages that
 * don't render <Seo> keep the static defaults from index.html.
 *
 * Supports JSON-LD structured data via the `schema` prop for AEO/GEO optimization.
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
  /** JSON-LD structured data object(s) for rich results and AI citation. */
  schema?: object | object[]
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

/** Upsert a JSON-LD script tag with a unique key. */
function upsertSchema(key: string, schema: object): void {
  let el = document.head.querySelector<HTMLScriptElement>(`[data-seo-schema="${key}"]`)
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-seo-schema', key)
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(schema)
}

/** Remove schema tags not in the current page's schema list. */
function cleanupSchemas(activeKeys: string[]): void {
  const allSchemas = document.head.querySelectorAll<HTMLScriptElement>('[data-seo-schema]')
  allSchemas.forEach((el) => {
    const key = el.getAttribute('data-seo-schema')
    if (key && !activeKeys.includes(key)) {
      el.remove()
    }
  })
}

export default function Seo({
  title,
  description,
  path = '/',
  type = 'website',
  image = DEFAULT_IMAGE,
  noindex = false,
  schema,
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
    upsertTag('og:image:alt', 'meta', { property: 'og:image:alt', content: title })

    // Twitter card
    upsertTag('twitter:card', 'meta', { name: 'twitter:card', content: 'summary_large_image' })
    upsertTag('twitter:title', 'meta', { name: 'twitter:title', content: title })
    upsertTag('twitter:description', 'meta', { name: 'twitter:description', content: desc })
    upsertTag('twitter:image', 'meta', { name: 'twitter:image', content: image })
    upsertTag('twitter:image:alt', 'meta', { name: 'twitter:image:alt', content: title })

    // Robots
    upsertTag('robots', 'meta', {
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow',
    })

    // Structured data (JSON-LD)
    if (schema) {
      const schemas = Array.isArray(schema) ? schema : [schema]
      schemas.forEach((s, i) => {
        const key = `schema-${path.replace(/\//g, '-')}-${i}`
        upsertSchema(key, s)
      })
      // Clean up old schemas from previous pages
      const activeKeys = schemas.map((_, i) => `schema-${path.replace(/\//g, '-')}-${i}`)
      cleanupSchemas(activeKeys)
    } else {
      // Clean up all schemas if none provided for this page
      cleanupSchemas([])
    }
  }, [title, description, path, type, image, noindex, schema])

  return null
}