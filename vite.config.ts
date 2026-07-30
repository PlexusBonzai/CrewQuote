import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function legacyJwtRole(key: string) {
  try {
    const payload = key.split('.')[1]
    return payload ? String(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.role || '') : ''
  } catch {
    return ''
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const fileEnv = loadEnv(mode, process.cwd(), 'VITE_')
    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? '').trim()
    const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
    const errors: string[] = []
    if (!supabaseUrl) errors.push('VITE_SUPABASE_URL is missing')
    if (!publishableKey) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing')
    if (supabaseUrl) {
      try {
        if (new URL(supabaseUrl).protocol !== 'https:') errors.push('VITE_SUPABASE_URL must use HTTPS')
      } catch {
        errors.push('VITE_SUPABASE_URL is not a valid URL')
      }
    }
    if (publishableKey.startsWith('sb_secret_') || legacyJwtRole(publishableKey) === 'service_role') {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY contains a secret/service-role key')
    }
    if (errors.length) throw new Error(`CrewQuote production build stopped: ${errors.join('; ')}. Values were not printed.`)
  }

  return {
    plugins: [react()],
    server: {
      // Restrict to localhost — defence against GHSA-67mh-4wv8-2f99 (esbuild dev server)
      host: '127.0.0.1',
    },
  }
})
