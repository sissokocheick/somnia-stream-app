import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // <-- AJOUTER CETTE LIGNE

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { // <-- AJOUTER TOUT CET OBJET
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})