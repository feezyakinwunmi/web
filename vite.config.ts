import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // "/" for a subdomain (dashboard.vesphe.com), "/dashboard/" for a sub-folder.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
  }
})
