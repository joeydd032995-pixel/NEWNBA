/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base backgrounds — pure black scale
        dark: {
          950: '#000000',
          900: '#080808',
          800: '#0f0f0f',
          700: '#141414',
          600: '#1a1a1a',
          500: '#242424',
          400: '#2e2e2e',
          300: '#3a3a3a',
          200: '#888888',
          100: '#aaaaaa',
          50:  '#cccccc',
        },
        // Neon Green — positive / EV gains / success
        'neon-green': {
          300: '#80ff5f',
          400: '#57ff2a',
          500: '#39ff14',
          600: '#28cc0f',
          700: '#1a8a0a',
        },
        // Neon Red — negative / danger / live
        'neon-red': {
          300: '#ff6b8a',
          400: '#ff3359',
          500: '#ff073a',
          600: '#cc0030',
          700: '#8a0020',
        },
        // Neon Blue — primary actions / links / navigation
        'neon-blue': {
          300: '#6ef3ff',
          400: '#33e3ff',
          500: '#00d4ff',
          600: '#00aacc',
          700: '#007a99',
        },
        // Neon Purple — models / analytics / ensemble
        'neon-purple': {
          300: '#e080ff',
          400: '#d44dff',
          500: '#bf00ff',
          600: '#9900cc',
          700: '#6600aa',
        },
        // Neon Yellow — warnings / Kelly / odds values
        'neon-yellow': {
          300: '#ffff80',
          400: '#ffff40',
          500: '#ffff00',
          600: '#cccc00',
          700: '#aaaa00',
        },
        // Semantic states (mapped to neon colors)
        success: {
          400: '#57ff2a',
          500: '#39ff14',
          600: '#28cc0f',
          900: '#0a2e05',
        },
        danger: {
          400: '#ff3359',
          500: '#ff073a',
          600: '#cc0030',
          900: '#2e0010',
        },
        warning: {
          400: '#ffff40',
          500: '#ffff00',
          600: '#cccc00',
          900: '#2e2e00',
        },
        // Primary alias — neon blue for actions/links
        primary: {
          300: '#6ef3ff',
          400: '#33e3ff',
          500: '#00d4ff',
          600: '#00aacc',
          700: '#007a99',
        },
        // Keep navy alias for any legacy references
        navy: {
          950: '#000000',
          900: '#080808',
          800: '#0f0f0f',
          700: '#141414',
          600: '#1a1a1a',
          500: '#242424',
        },
      },
      backgroundImage: {
        'app-base': 'linear-gradient(160deg, #000000 0%, #080808 40%, #050505 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #080808 0%, #0f0f0f 100%)',
        'hero-gradient': 'linear-gradient(135deg, #0f0f0f 0%, #141414 50%, #0a0a0a 100%)',
        'green-glow': 'linear-gradient(135deg, #39ff14 0%, #57ff2a 100%)',
        'red-glow': 'linear-gradient(135deg, #ff073a 0%, #ff3359 100%)',
        'blue-glow': 'linear-gradient(135deg, #00d4ff 0%, #33e3ff 100%)',
        'purple-glow': 'linear-gradient(135deg, #bf00ff 0%, #d44dff 100%)',
        'yellow-glow': 'linear-gradient(135deg, #ffff00 0%, #ffff40 100%)',
        'card-glass': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        'stat-gradient': 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(191,0,255,0.04) 100%)',
        // Legacy aliases
        'gold-glow': 'linear-gradient(135deg, #ffff00 0%, #ffff40 100%)',
        'cyan-glow': 'linear-gradient(135deg, #00d4ff 0%, #33e3ff 100%)',
      },
      boxShadow: {
        'neon-green':     '0 0 20px rgba(57,255,20,0.6), 0 0 40px rgba(57,255,20,0.3), 0 4px 16px rgba(0,0,0,0.8)',
        'neon-green-sm':  '0 0 10px rgba(57,255,20,0.4)',
        'neon-red':       '0 0 20px rgba(255,7,58,0.6), 0 0 40px rgba(255,7,58,0.3), 0 4px 16px rgba(0,0,0,0.8)',
        'neon-red-sm':    '0 0 10px rgba(255,7,58,0.4)',
        'neon-blue':      '0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3), 0 4px 16px rgba(0,0,0,0.8)',
        'neon-blue-sm':   '0 0 10px rgba(0,212,255,0.4)',
        'neon-purple':    '0 0 20px rgba(191,0,255,0.6), 0 0 40px rgba(191,0,255,0.3), 0 4px 16px rgba(0,0,0,0.8)',
        'neon-purple-sm': '0 0 10px rgba(191,0,255,0.4)',
        'neon-yellow':    '0 0 20px rgba(255,255,0,0.6), 0 0 40px rgba(255,255,0,0.3), 0 4px 16px rgba(0,0,0,0.8)',
        'neon-yellow-sm': '0 0 10px rgba(255,255,0,0.4)',
        'card':           '0 4px 24px rgba(0,0,0,0.7), 0 1px 4px rgba(0,0,0,0.5)',
        'card-hover':     '0 8px 32px rgba(0,0,0,0.85)',
        'inset-border':   'inset 0 1px 0 rgba(255,255,255,0.04)',
        // Legacy aliases
        'gold':           '0 0 20px rgba(255,255,0,0.5), 0 4px 16px rgba(0,0,0,0.8)',
        'gold-sm':        '0 0 10px rgba(255,255,0,0.35)',
        'cyan':           '0 0 20px rgba(0,212,255,0.5), 0 4px 16px rgba(0,0,0,0.8)',
        'cyan-sm':        '0 0 10px rgba(0,212,255,0.35)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.06)',
        'glass-strong': 'rgba(255,255,255,0.10)',
      },
      animation: {
        'pulse-blue':   'pulseBlue 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-green':  'pulseGreen 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'pulse-red':    'pulseRed 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':      'shimmer 1.5s infinite',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'fade-in':      'fadeIn 0.15s ease-out',
        // Legacy alias
        'pulse-gold':   'pulseBlue 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        pulseBlue: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6', boxShadow: '0 0 16px rgba(0,212,255,0.6)' },
        },
        pulseGreen: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6', boxShadow: '0 0 16px rgba(57,255,20,0.6)' },
        },
        pulseRed: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5', boxShadow: '0 0 16px rgba(255,7,58,0.7)' },
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
      transitionDuration: {
        150: '150ms',
        200: '200ms',
      },
    },
  },
  plugins: [],
}
