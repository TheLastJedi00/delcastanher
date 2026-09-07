/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#244779',
          'navy-light': '#2D5A9A',
          teal: '#168A91',
          // Variante escurecida do teal para TEXTO pequeno sobre superficie clara:
          // o #168A91 fica em 4.1:1 sobre branco e nao atinge o AA de 4.5:1.
          'teal-deep': '#12777E',
          'teal-light': '#28C3D9',
          steel: '#5F91AD',
          surface: '#F8FAFC',
        },
        state: {
          success: '#059669',
          warning: '#D97706',
          danger: '#DC2626',
          info: '#28C3D9',
        },
      },
      backgroundImage: {
        'gradient-teal': 'linear-gradient(135deg, #168A91, #28C3D9, #168A91)',
        'gradient-navy': 'linear-gradient(135deg, #244779, #5F91AD, #244779)',
        'gradient-brand': 'linear-gradient(135deg, #244779, #168A91)',
        'gradient-glass': 'linear-gradient(135deg, rgba(36,71,121,0.05), rgba(22,138,145,0.05))',
        'gradient-hero': 'linear-gradient(135deg, #244779 0%, #168A91 50%, #28C3D9 100%)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      borderWidth: {
        '3': '3px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(36, 71, 121, 0.08)',
        'glass-lg': '0 16px 48px rgba(36, 71, 121, 0.12)',
        'glow-teal': '0 0 20px rgba(22, 138, 145, 0.15)',
        'glow-navy': '0 0 20px rgba(36, 71, 121, 0.15)',
        'card': '0 1px 3px rgba(36, 71, 121, 0.06), 0 1px 2px rgba(36, 71, 121, 0.04)',
        'card-hover': '0 10px 40px rgba(36, 71, 121, 0.10)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.6s ease-out',
        'slide-in-left': 'slideInLeft 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
