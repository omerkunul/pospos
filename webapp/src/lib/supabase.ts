import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    APP_CONFIG?: {
      SUPABASE_URL?: string
      SUPABASE_ANON_KEY?: string
    }
  }
}

const fallbackUrl = 'https://api.stracture.net'
const fallbackAnon =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.SlSLNHMpZtEuZKZYzrbA5mQ2REmVa6oakcw6GOG6Ft0'

const browserConfig = typeof window !== 'undefined' ? window.APP_CONFIG : undefined

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || browserConfig?.SUPABASE_URL || fallbackUrl

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || browserConfig?.SUPABASE_ANON_KEY || fallbackAnon

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes('YOUR_') &&
  !SUPABASE_ANON_KEY.includes('YOUR_')

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
