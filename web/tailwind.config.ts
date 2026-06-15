import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#070B14',
          secondary: '#0C1426',
          tertiary: '#111D35',
          elevated: '#162544',
        },
        accent: {
          from: '#FF8C00',
          via: '#FF6B35',
          to: '#FFB347',
        },
        text: {
          primary: '#EBF0FF',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
        border: {
          DEFAULT: 'rgba(147,197,253,0.06)',
          hover: 'rgba(147,197,253,0.12)',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        code: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        input: '4px',
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
        elevated: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.5)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'spin-slow': 'spin 0.8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
