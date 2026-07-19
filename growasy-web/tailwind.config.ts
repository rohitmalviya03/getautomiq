import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Automiq brand — vivid purple/violet (the logo's dominant hue).
        brand: {
          50: '#f7f4fe',
          100: '#efe7fd',
          200: '#e0d0fb',
          300: '#cbadf7',
          400: '#ae7ff0',
          500: '#9450e6',
          600: '#8232d6',
          700: '#6f26b8',
          800: '#5c2196',
          900: '#4b1d78',
          950: '#2f0f52',
        },
        // Deep navy-purple used for the logo's bot mark / wordmark.
        ink: {
          DEFAULT: '#211a37',
          soft: '#2c2447',
        },
      },
      backgroundImage: {
        // Signature Instagram-style gradient: violet → magenta → orange.
        'brand-gradient': 'linear-gradient(135deg, #7c3aed 0%, #c4249f 48%, #f77737 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #8232d6 0%, #c4249f 55%, #fb8c3a 100%)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Punchy geometric display face for headings / wordmark.
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        // Colored glow for CTAs and active nav — the Gen-Z "neon" pop.
        glow: '0 8px 24px -6px rgba(146, 80, 230, 0.45)',
        'glow-lg': '0 16px 40px -8px rgba(196, 36, 159, 0.5)',
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.2s ease-out',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
