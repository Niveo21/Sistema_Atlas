/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Preflight desactivado: el reset base lo aporta MUI (CssBaseline) y así no se pisan.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
