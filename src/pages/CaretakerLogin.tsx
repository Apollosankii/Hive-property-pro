import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Building2, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function CaretakerLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { setUser } = useAuthStore()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // First, authenticate with Supabase Auth
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // Provide more helpful error messages
        if (signInError.message.includes('email') && signInError.message.includes('confirm')) {
          throw new Error('Email not confirmed. Please check your email for confirmation link, or contact your administrator.')
        }
        if (signInError.message.includes('Invalid login credentials') || signInError.status === 400) {
          throw new Error('Invalid email or password. Please check your credentials and try again.')
        }
        throw signInError
      }

      if (data.user) {
        // Now that user is authenticated, check if they're a caretaker
        const { data: caretakerData, error: caretakerError } = await supabase
          .from('caretakers')
          .select('id, status')
          .eq('user_id', data.user.id)
          .single()

        if (caretakerError || !caretakerData) {
          // User is not a caretaker, sign them out
          await supabase.auth.signOut()
          throw new Error('This account is not registered as a caretaker. Please use the manager login instead.')
        }

        if (caretakerData.status !== 'active') {
          await supabase.auth.signOut()
          throw new Error('Caretaker account is inactive. Please contact your administrator.')
        }

        setUser(data.user)
        navigate('/caretaker')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="card p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
              <Building2 className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-zinc-50 dark:to-zinc-200 bg-clip-text text-transparent">
              Caretaker Portal
            </h1>
            <p className="text-slate-600 dark:text-zinc-400 mt-2">
              Sign in to manage inventory and tenants
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="caretaker@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 dark:border-zinc-700 pt-4">
            <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
              Are you a manager?{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors">
                Sign in as Manager
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

