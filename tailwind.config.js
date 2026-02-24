/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.tsx",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'cinzel': ['Cinzel', 'serif'],
        'lato': ['Lato', 'sans-serif'],
        'romance': ['"Dancing Script"', 'cursive'], // Assuming Dancing Script is loaded or a fallback
      },
      colors: {
        // Define your custom colors here if they are not standard Tailwind colors
        // For example, if 'amber' or 'sky' were not default
      }
    },
  },
  plugins: [],
  safelist: [
    // Dynamic background colors for deepAnalysis archetype
    'bg-amber-900',
    'bg-sky-900',
    'bg-rose-900',
    'bg-slate-900',
    'bg-orange-900',
    'bg-violet-900',
    'bg-emerald-900',
    'bg-red-900',
    // Dynamic text colors for general styling (if needed)
    'text-amber-900',
    'text-sky-900',
    'text-rose-900',
    'text-slate-900',
    'text-orange-900',
    'text-violet-900',
    'text-emerald-900',
    'text-red-900',
    // Dynamic accent colors
    'bg-amber-100',
    'bg-violet-900/20',
    'border-violet-500/20',
    'text-violet-200/70',
    'text-amber-400/60',
    'bg-rose-900/20',
    'border-rose-500/20',
    'text-rose-200/70',
  ],
}
