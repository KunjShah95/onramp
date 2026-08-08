import type { Config } from 'tailwindcss'

/**
 * ONRAMP MISSION CONTROL — token layer (superset).
 * The Flight Operations Room: a daylit console floor. Cool gray-green ground,
 * near-white instrument panels seamed by hairlines, ink nomenclature, strict
 * four-signal status palette (GO / mission blue / caution / abort). See DESIGN.md.
 *
 * Two naming layers over ONE palette:
 *  - Mission-native: room/base/panel/ink/go/mission/caution/abort/seam
 *  - Legacy semantic: bg.* / accent.* / text.* / border.* / success|warning|error|info
 * Both resolve to identical Mission Control values so every page renders.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Mission-native names (var-driven → real light/dark themes) ──
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
        display: ['"Archivo Expanded"', 'Archivo', 'system-ui', 'sans-serif'],
        heading: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['"Public Sans"', 'Inter', 'system-ui', 'sans-serif'],
        code: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Mission-native semantic
        'display': ['clamp(1.75rem, 4vw, 3.25rem)', { lineHeight: '1.02', letterSpacing: '-0.02em', fontWeight: '800' }],
        'heading': ['1.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'callsign': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.14em', fontWeight: '700' }],
        'readout': ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        // Legacy display ramp (headings)
        'display-2xl': ['64px', { lineHeight: '1.02', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-xl': ['52px', { lineHeight: '1.04', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display-lg': ['40px', { lineHeight: '1.06', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-md': ['30px', { lineHeight: '1.12', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-sm': ['22px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-xs': ['18px', { lineHeight: '1.3', letterSpacing: '0em', fontWeight: '700' }],
        // Body ramp
        'body-lg': ['17px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['0.875rem', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-xs': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'overline': ['11px', { lineHeight: '1', letterSpacing: '0.14em', fontWeight: '700' }],
        'code-sm': ['13px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      borderRadius: {
        tile: '2px',
        sm: '3px',
        md: '4px',
        card: '4px',
        btn: '3px',
        input: '3px',
        pill: '9999px',
      },
      boxShadow: {
        // Mission-native
        seam: '0 0 0 1px rgba(24,27,24,0.10), 0 1px 2px rgba(24,27,24,0.06)',
        lift: '0 0 0 1px rgba(24,27,24,0.10), 0 4px 16px rgba(24,27,24,0.10)',
        overhead: '0 0 0 1px rgba(24,27,24,0.12), 0 12px 32px rgba(24,27,24,0.14)',
        'lit-inner': 'inset 0 1px 0 rgba(255,255,255,0.30)',
        // Legacy aliases
        card: '0 0 0 1px rgba(24,27,24,0.02), 0 1px 2px rgba(24,27,24,0.06)',
        elevated: '0 0 0 1px rgba(24,27,24,0.04), 0 4px 16px rgba(24,27,24,0.10)',
        'elevated-lg': '0 0 0 1px rgba(24,27,24,0.06), 0 12px 32px rgba(24,27,24,0.14)',
        glow: '0 0 0 1px rgba(14,122,60,0.35)',
        'glow-strong': '0 0 0 1px rgba(14,122,60,0.55)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.5)',
        lit: 'inset 0 1px 0 rgba(255,255,255,0.30), 0 1px 2px rgba(24,27,24,0.12)',
        dashboard: '0 1px 2px rgba(24,27,24,0.06), 0 0 0 1px rgba(24,27,24,0.08)',
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
        'gradient-accent': 'linear-gradient(180deg, #17A34A 0%, #0E7A3C 100%)',
        'gradient-accent-soft': 'linear-gradient(180deg, rgba(14,122,60,0.14) 0%, rgba(14,122,60,0.05) 100%)',
        'gradient-ambient': 'radial-gradient(ellipse 700px 420px at 50% 0%, rgba(14,122,60,0.05) 0%, transparent 70%)',
        'gradient-hero': 'linear-gradient(180deg, rgba(14,122,60,0.06) 0%, transparent 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
