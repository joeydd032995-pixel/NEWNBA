/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base backgrounds — deep navy/dark core
        navy: {
          950: '#040812',
          900: '#080d1a',
          800: '#0d1425',
          700: '#131c30',
          600: '#1a253d',
          500: '#233050',
        },
        // Primary — electric amber/gold (NBA feel)
        gold: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Secondary accent — electric cyan for data/stats
        cyan: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        // Orange accent — NBA orange for action/CTAs
        orange: {
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        // Semantic states
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          900: '#14532d',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          900: '#7f1d1d',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          900: '#451a03',
        },
        // Keep a slate override for compatibility
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Primary (maps to gold to replace old blue)
        primary: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
      },
      backgroundImage: {
        'app-base': 'linear-gradient(160deg, #040812 0%, #080d1a 40%, #0a0f1e 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #080d1a 0%, #0d1425 100%)',
        'hero-gradient': 'linear-gradient(135deg, #0d1425 0%, #131c30 50%, #0d1a2e 100%)',
        'gold-glow': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        'cyan-glow': 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
        'card-glass': 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        'stat-gradient': 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(6,182,212,0.06) 100%)',
      },
      boxShadow: {
        'gold': '0 0 20px rgba(245, 158, 11, 0.25), 0 4px 16px rgba(0,0,0,0.4)',
        'gold-sm': '0 0 10px rgba(245, 158, 11, 0.15)',
        'cyan': '0 0 20px rgba(6, 182, 212, 0.25), 0 4px 16px rgba(0,0,0,0.4)',
        'cyan-sm': '0 0 10px rgba(6, 182, 212, 0.15)',
        'card': '0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(245,158,11,0.08)',
        'inset-border': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.07)',
        'glass-strong': 'rgba(255,255,255,0.12)',
      },
      animation: {
        'pulse-gold': 'pulseGold 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        pulseGold: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6, boxShadow: '0 0 12px rgba(245,158,11,0.4)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          from: { opacity: 0, transform: 'translateX(16px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
      },
    },
  },
  plugins: [],
}
