/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm amber/orange primary
        "primary": "#e8913a",
        "primary-dim": "#c77a2e",
        "primary-fixed": "#f5a54d",
        "primary-fixed-dim": "#d4882f",
        "primary-container": "#e8913a",
        "on-primary": "#1a0e00",
        "on-primary-fixed": "#000000",
        "on-primary-fixed-variant": "#3d1f00",
        "on-primary-container": "#1a0e00",
        // Secondary - warm green/teal for positive
        "secondary": "#4ade80",
        "secondary-dim": "#22c55e",
        "secondary-fixed": "#4ade80",
        "secondary-fixed-dim": "#22c55e",
        "secondary-container": "#166534",
        "on-secondary": "#052e16",
        "on-secondary-fixed": "#052e16",
        "on-secondary-fixed-variant": "#166534",
        "on-secondary-container": "#bbf7d0",
        // Tertiary - soft amber
        "tertiary": "#fbbf24",
        "tertiary-dim": "#f59e0b",
        "tertiary-fixed": "#fbbf24",
        "tertiary-fixed-dim": "#f59e0b",
        "tertiary-container": "#92400e",
        "on-tertiary": "#451a03",
        "on-tertiary-fixed": "#451a03",
        "on-tertiary-fixed-variant": "#78350f",
        "on-tertiary-container": "#fef3c7",
        // Warm dark surfaces
        "surface": "#0f0906",
        "surface-dim": "#0f0906",
        "surface-bright": "#2a1f14",
        "surface-variant": "#241a10",
        "surface-tint": "#e8913a",
        "surface-container-lowest": "#080402",
        "surface-container-low": "#150e08",
        "surface-container": "#1a120a",
        "surface-container-high": "#211710",
        "surface-container-highest": "#2a1f14",
        "background": "#0f0906",
        // Text on warm surfaces
        "on-surface": "#f0e6dc",
        "on-surface-variant": "#a89585",
        "on-background": "#f0e6dc",
        // Warm borders
        "outline": "#7a6a58",
        "outline-variant": "#4a3828",
        // Inverse
        "inverse-surface": "#f5efe8",
        "inverse-on-surface": "#5a4a38",
        "inverse-primary": "#8b5a1e",
        // Error - coral red
        "error": "#f87171",
        "error-dim": "#dc2626",
        "error-container": "#991b1b",
        "on-error": "#450a0a",
        "on-error-container": "#fecaca",
      },
      fontFamily: {
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        label: ['Manrope', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        'primary': '0 0 20px rgba(232,145,58,0.3)',
        'primary-sm': '0 0 10px rgba(232,145,58,0.2)',
        'secondary': '0 0 20px rgba(74,222,128,0.3)',
        'secondary-sm': '0 0 10px rgba(74,222,128,0.2)',
        'card': '0 4px 24px rgba(0,0,0,0.7)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.85)',
      },
      animation: {
        'pulse-primary': 'pulsePrimary 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        pulsePrimary: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6', boxShadow: '0 0 16px rgba(232,145,58,0.6)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
