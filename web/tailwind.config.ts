import type { Config } from 'tailwindcss'

/**
 * ONRAMP FOLIO — token layer.
 * The Stacks: a research library for a living codebase.
 * Cool reading-room ground, buckram-teal spine, Schibsted + Source Sans 3.
 * See DESIGN.md.
 *
 * Two naming layers over ONE palette:
 *  - Folio-native: room/base/panel/ink/go/mission/caution/abort/seam
 *  - Legacy semantic: bg.* / accent.* / text.* / border.* / success|warning|error|info
 */
const signalRamp = (base: string, lit: string) => ({
  '50': `rgb(var(${base}) / 0.06)`,
  '100': `rgb(var(${base}) / 0.12)`,
  '200': `rgb(var(${base}) / 0.22)`,
  '300': `rgb(var(${lit}) / 0.85)`,
  '400': `rgb(var(${lit}) / <alpha-value>)`,
  '500': `rgb(var(${base}) / <alpha-value>)`,
  '600': `rgb(var(${base}) / <alpha-value>)`,
  '700': `rgb(var(${base}) / 0.88)`,
  '800': `rgb(var(${base}) / 0.75)`,
  '900': `rgb(var(${base}) / 0.6)`,
  '950': `rgb(var(${base}) / 0.5)`,
})

/**
 * Legacy signal ramp — maps stock Tailwind hues onto Folio status tokens
 * (buckram / cobalt / ochre / binding red) so older palette class names
 * still inherit the product language.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Legacy signal bridge: stock hues → Mission Control signals ──
        red: signalRamp('--error', '--error-lit'),
        rose: signalRamp('--error', '--error-lit'),
        amber: signalRamp('--warning', '--warning-lit'),
        yellow: signalRamp('--warning', '--warning-lit'),
        orange: signalRamp('--warning', '--warning-lit'),
        emerald: signalRamp('--success', '--success-lit'),
        green: signalRamp('--success', '--success-lit'),
        lime: signalRamp('--success', '--success-lit'),
        teal: signalRamp('--success', '--success-lit'),
        blue: signalRamp('--info', '--info-lit'),
        sky: signalRamp('--info', '--info-lit'),
        cyan: signalRamp('--info', '--info-lit'),
        indigo: signalRamp('--info', '--info-lit'),
        violet: signalRamp('--info', '--info-lit'),
        purple: signalRamp('--info', '--info-lit'),
        pink: signalRamp('--info', '--info-lit'),
        fuchsia: signalRamp('--info', '--info-lit'),

        // ── Folio-native names (var-driven → real light/dark themes) ──
        room: 'var(--room)',
        panel: 'var(--panel)',
        'panel-raised': 'var(--panel-raised)',
        well: 'var(--well)',
        inset: 'var(--inset)',
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
          muted: 'var(--ink-muted)',
          disabled: 'var(--ink-disabled)',
        },
        go: { DEFAULT: 'var(--go)', lit: 'var(--go-lit)' },
        mission: { DEFAULT: 'var(--mission)', lit: 'var(--mission-lit)' },
        caution: { DEFAULT: 'var(--caution)', lit: 'var(--caution-lit)' },
        abort: { DEFAULT: 'var(--abort)', lit: 'var(--abort-lit)' },
        seam: { DEFAULT: 'var(--seam)', strong: 'var(--seam-strong)' },

        // ── Legacy semantic names (var-driven; <alpha-value> keeps opacity modifiers working) ──
        bg: {
          void: 'rgb(var(--bg-void) / <alpha-value>)',
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
          surface: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        accent: {
          from: 'rgb(var(--accent-from) / <alpha-value>)',
          via: 'rgb(var(--accent-via) / <alpha-value>)',
          to: 'rgb(var(--accent-to) / <alpha-value>)',
          muted: 'rgb(var(--accent-muted) / 0.12)',
          glow: 'rgb(var(--accent-glow) / 0.06)',
          primary: 'rgb(var(--accent-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--accent-primary-hover) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--text-tertiary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          disabled: 'rgb(var(--text-disabled) / <alpha-value>)',
        },
        border: {
          subtle: 'rgb(var(--border-rgb) / 0.06)',
          DEFAULT: 'rgb(var(--border-rgb) / 0.12)',
          hover: 'rgb(var(--border-rgb) / 0.20)',
          active: 'rgb(var(--border-rgb) / 0.28)',
          accent: 'rgb(var(--accent-from) / 0.35)',
        },
        success: { DEFAULT: 'rgb(var(--success) / <alpha-value>)', lit: 'rgb(var(--success-lit) / <alpha-value>)', muted: 'rgb(var(--success) / 0.12)' },
        warning: { DEFAULT: 'rgb(var(--warning) / <alpha-value>)', lit: 'rgb(var(--warning-lit) / <alpha-value>)', muted: 'rgb(var(--warning) / 0.12)' },
        error: { DEFAULT: 'rgb(var(--error) / <alpha-value>)', lit: 'rgb(var(--error-lit) / <alpha-value>)', muted: 'rgb(var(--error) / 0.12)' },
        info: { DEFAULT: 'rgb(var(--info) / <alpha-value>)', lit: 'rgb(var(--info-lit) / <alpha-value>)', muted: 'rgb(var(--info) / 0.12)' },
        nx: {
          background: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          primary: 'hsl(var(--primary))',
          'primary-foreground': 'hsl(var(--primary-foreground))',
          secondary: 'hsl(var(--secondary))',
          'secondary-foreground': 'hsl(var(--secondary-foreground))',
          muted: 'hsl(var(--muted))',
          'muted-foreground': 'hsl(var(--muted-foreground))',
          accent: 'hsl(var(--accent))',
          'accent-foreground': 'hsl(var(--accent-foreground))',
          border: 'hsl(var(--border))',
          ring: 'hsl(var(--ring))',
        },
      },
      fontFamily: {
        display: ['"Schibsted Grotesk"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
        heading: ['"Schibsted Grotesk"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        code: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        // `font-mono` (legacy utility) also resolves to the folio data face.
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '700' }],
        heading: ['1.125rem', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '650' }],
        callsign: ['0.8125rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '650' }],
        readout: ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        'display-2xl': ['40px', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-xl': ['32px', { lineHeight: '1.12', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-lg': ['28px', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['22px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-sm': ['18px', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '650' }],
        'display-xs': ['16px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '650' }],
        'body-lg': ['17px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-md': ['15px', { lineHeight: '1.55', fontWeight: '400' }],
        body: ['0.9375rem', { lineHeight: '1.55', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-xs': ['13px', { lineHeight: '1.45', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        overline: ['10.5px', { lineHeight: '1.3', letterSpacing: '0.1em', fontWeight: '600' }],
        kicker: ['10.5px', { lineHeight: '1.3', letterSpacing: '0.14em', fontWeight: '500' }],
        'code-sm': ['12px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      borderRadius: {
        tile: '3px',
        sm: '4px',
        md: '5px',
        card: '5px',
        btn: '4px',
        input: '4px',
        pill: '9999px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
      },
      boxShadow: {
        seam: '0 1px 2px rgba(27,29,34,0.04), 0 0 0 1px rgba(27,29,34,0.05)',
        lift: '0 4px 12px rgba(27,29,34,0.08), 0 0 0 1px rgba(27,29,34,0.05)',
        overhead: '0 12px 32px rgba(27,29,34,0.14)',
        'lit-inner': 'none',
        card: '0 1px 2px rgba(27,29,34,0.04), 0 0 0 1px rgba(27,29,34,0.05)',
        elevated: '0 4px 12px rgba(27,29,34,0.08), 0 0 0 1px rgba(27,29,34,0.05)',
        'elevated-lg': '0 12px 32px rgba(27,29,34,0.14)',
        glow: '0 0 0 2px color-mix(in srgb, var(--go) 35%, transparent)',
        'glow-strong': '0 0 0 2px color-mix(in srgb, var(--go) 55%, transparent)',
        'inner-glow': 'none',
        lit: '0 1px 2px rgba(27,29,34,0.04), 0 0 0 1px rgba(27,29,34,0.05)',
        dashboard: '0 1px 2px rgba(27,29,34,0.03), 0 0 0 1px rgba(27,29,34,0.05)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'in-expo': 'cubic-bezier(0.7, 0, 0.84, 0)',
        'smooth': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'instrument': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-down': 'fadeDown 0.35s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'spin-slow': 'spin 0.8s linear infinite',
        shimmer: 'shimmer 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'breath': 'breath 4s ease-in-out infinite',
        'blink': 'blink 1.4s steps(2, start) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(100%)' } },
        pulseGlow: { '0%, 100%': { opacity: '0.5' }, '50%': { opacity: '1' } },
        float: { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-8px)' } },
        breath: { '0%, 100%': { opacity: '0.6', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.02)' } },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(180deg, #178F88 0%, #0F6B66 100%)',
        'gradient-accent-soft': 'linear-gradient(180deg, rgba(15,107,102,0.12) 0%, rgba(15,107,102,0.04) 100%)',
        'gradient-ambient': 'radial-gradient(ellipse 700px 420px at 50% 0%, rgba(15,107,102,0.05) 0%, transparent 70%)',
        'gradient-hero': 'linear-gradient(180deg, rgba(15,107,102,0.05) 0%, transparent 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
