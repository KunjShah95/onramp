import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          void: '#09090B',
          primary: '#0D0D12',
          secondary: '#15151C',
          tertiary: '#1D1D26',
          elevated: '#252530',
          surface: '#2D2D3A',
        },
        accent: {
          from: '#F59E0B',
          via: '#D97706',
          to: '#FBBF24',
          muted: 'rgba(245,158,11,0.12)',
          glow: 'rgba(245,158,11,0.06)',
        },
        text: {
          primary: '#F1F1F3',
          secondary: '#90909E',
          muted: '#60606E',
          disabled: '#3B3B48',
        },
        border: {
          subtle: 'rgba(255,255,255,0.03)',
          DEFAULT: 'rgba(255,255,255,0.06)',
          hover: 'rgba(255,255,255,0.10)',
          active: 'rgba(255,255,255,0.16)',
          accent: 'rgba(245,158,11,0.25)',
        },
        success: {
          DEFAULT: '#10B981',
          muted: 'rgba(16,185,129,0.12)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted: 'rgba(245,158,11,0.12)',
        },
        error: {
          DEFAULT: '#EF4444',
          muted: 'rgba(239,68,68,0.12)',
        },
        info: {
          DEFAULT: '#3B82F6',
          muted: 'rgba(59,130,246,0.12)',
        },
        // Nexora HSL-based semantic colors
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
        display: ['Instrument Serif', 'Satoshi', 'serif'],
        body: ['Inter', 'DM Sans', 'sans-serif'],
        code: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['72px', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '700' }],
        'display-xl': ['56px', { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-lg': ['40px', { lineHeight: '1.12', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'display-sm': ['24px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-xs': ['20px', { lineHeight: '1.4', letterSpacing: '0em', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-xs': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'overline': ['11px', { lineHeight: '1', letterSpacing: '0.08em', fontWeight: '600' }],
        'code-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      borderRadius: {
        card: '16px',
        btn: '10px',
        input: '10px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.3)',
        elevated: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.4)',
        'elevated-lg': '0 0 0 1px rgba(255,255,255,0.08), 0 16px 48px rgba(0,0,0,0.5)',
        glow: '0 0 24px -8px rgba(245,158,11,0.15)',
        'glow-strong': '0 0 48px -8px rgba(245,158,11,0.25)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
        dashboard: '0 25px 80px -12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'in-expo': 'cubic-bezier(0.7, 0, 0.84, 0)',
        'smooth': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-down': 'fadeDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'spin-slow': 'spin 0.8s linear infinite',
        shimmer: 'shimmer 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'breath': 'breath 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        breath: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #FBBF24 100%)',
        'gradient-accent-soft': 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.08) 100%)',
        'gradient-ambient': 'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(245,158,11,0.04) 0%, transparent 70%)',
        'gradient-hero': 'linear-gradient(180deg, rgba(245,158,11,0.08) 0%, transparent 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
