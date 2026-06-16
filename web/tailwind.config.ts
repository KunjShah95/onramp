import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Existing CodeFlow 2.0 Colors ---
        bg: {
          void: '#050810',
          primary: '#070B14',
          secondary: '#0C1426',
          tertiary: '#111D35',
          elevated: '#162544',
          surface: '#1C2D50',
        },
        accent: {
          from: '#FF8C00',
          via: '#FF6B35',
          to: '#FFB347',
          muted: 'rgba(255, 140, 0, 0.12)',
          glow: 'rgba(255, 140, 0, 0.06)',
        },
        text: {
          primary: '#EBF0FF',
          secondary: '#94A3B8',
          muted: '#64748B',
          disabled: '#374151',
        },
        border: {
          subtle: 'rgba(147,197,253,0.04)',
          DEFAULT: 'rgba(147,197,253,0.06)',
          hover: 'rgba(147,197,253,0.12)',
          active: 'rgba(147,197,253,0.20)',
          accent: 'rgba(255,140,0,0.30)',
        },
        success: {
          DEFAULT: '#22C55E',
          muted: 'rgba(34, 197, 94, 0.12)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted: 'rgba(245, 158, 11, 0.12)',
        },
        error: {
          DEFAULT: '#EF4444',
          muted: 'rgba(239, 68, 68, 0.12)',
        },
        info: {
          DEFAULT: '#3B82F6',
          muted: 'rgba(59, 130, 246, 0.12)',
        },
        
        // --- New Template Colors ---
        "on-primary-container": "#623200",
        "inverse-surface": "#f3dfd1",
        "surface-bright": "#43372e",
        "on-tertiary-container": "#004360",
        "on-error-container": "#ffdad6",
        "primary-fixed": "#ffdcc3",
        "tertiary": "#85cfff",
        "surface-container-low": "#241912",
        "tertiary-fixed-dim": "#85cfff",
        "surface-tint": "#ffb77d",
        "inverse-on-surface": "#3a2e25",
        "on-surface-variant": "#ddc1ae",
        "primary-container": "#ff8c00",
        "secondary-fixed": "#ffdbd0",
        "surface-variant": "#3f3229",
        "background": "#1b110a",
        "on-secondary-fixed": "#390c00",
        "on-primary-fixed": "#2f1500",
        "outline": "#a48c7a",
        "tertiary-fixed": "#c7e7ff",
        "on-primary-fixed-variant": "#6e3900",
        "on-tertiary-fixed": "#001e2e",
        "primary-fixed-dim": "#ffb77d",
        "on-secondary-container": "#ffddd2",
        "surface-container-highest": "#3f3229",
        "on-tertiary": "#00344c",
        "secondary-container": "#b83900",
        "primary": "#ffb77d",
        "surface-container": "#281d15",
        "on-error": "#690005",
        "inverse-primary": "#904d00",
        "tertiary-container": "#00b5fc",
        "secondary-fixed-dim": "#ffb59d",
        "secondary": "#ffb59d",
        "on-primary": "#4d2600",
        "surface-container-lowest": "#150c06",
        "surface-container-high": "#33281f",
        "surface-dim": "#1b110a",
        "on-background": "#f3dfd1",
        "on-secondary": "#5d1900",
        "on-surface": "#f3dfd1",
        "surface": "#1b110a",
        "on-tertiary-fixed-variant": "#004c6c",
        "outline-variant": "#564334",
        "on-secondary-fixed-variant": "#832600",
        "error-container": "#93000a",
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        code: ['JetBrains Mono', 'monospace'],
        serif: ['Instrument Serif', 'serif'],
        
        // --- New Template Fonts ---
        "display-lg": ["Space Grotesk"],
        "body-lg": ["Inter"],
        "headline-lg-mobile": ["Space Grotesk"],
        "headline-md": ["Space Grotesk"],
        "label-caps": ["JetBrains Mono"],
        "headline-lg": ["Space Grotesk"],
        "code-sm": ["JetBrains Mono"],
        "body-md": ["Inter"]
      },
      fontSize: {
        "display-lg": ["64px", { lineHeight: "1.1", letterSpacing: "-0.04em", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-lg-mobile": ["32px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "1.4", fontWeight: "500" }],
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.1em", fontWeight: "500" }],
        "headline-lg": ["40px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "code-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }]
      },
      spacing: {
        "unit": "4px",
        "gutter": "24px",
        "margin-desktop": "64px",
        "margin-mobile": "16px",
        "container-max": "1280px"
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        input: '8px',
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem"
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)',
        elevated: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.5)',
        glow: '0 0 40px -12px rgba(255,140,0,0.15)',
        'glow-strong': '0 0 60px -8px rgba(255,140,0,0.25)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'spin-slow': 'spin 0.8s linear infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-cta': 'linear-gradient(135deg, #FF8C00 0%, #FF6B35 50%, #FFB347 100%)',
        'gradient-hero': 'linear-gradient(135deg, #FF8C00 0%, #FFB347 50%, #FFD700 100%)',
        'gradient-ambient': 'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(255,140,0,0.04) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
} satisfies Config
