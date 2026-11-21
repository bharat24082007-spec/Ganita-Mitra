import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind runs as a Vite plugin, so there is no postcss config.
export default defineConfig({ plugins: [react(), tailwindcss()] })
