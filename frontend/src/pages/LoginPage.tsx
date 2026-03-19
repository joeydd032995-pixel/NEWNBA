import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dumbbell, Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail]       = useState('pro@test.com')
  const [password, setPassword] = useState('Password123!')
  const [showPw, setShowPw]     = useState(false)
  const { login, isLoading }    = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err: any) {
      const msg = err.response?.data?.message
      if (msg) {
        toast.error(msg)
      } else if (err.request && !err.response) {
        toast.error('Cannot reach the server. Please check that the backend is running.')
      } else {
        toast.error('Login failed. Please try again.')
      }
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #000000 0%, #080808 60%, #050505 100%)' }}
    >
      {/* Background glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none opacity-20"
           style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none opacity-15"
           style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.25) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', boxShadow: '0 0 32px rgba(245,158,11,0.35)' }}>
            <Dumbbell size={26} className="text-navy-950" style={{ color: '#040812' }} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NEWNBA</h1>
          <p className="text-slate-500 text-sm mt-1">Analytics Platform</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h2 className="text-base font-semibold text-white mb-5">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors duration-150"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <LogIn size={14} />
                  Sign In
                </span>
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div
            className="mt-4 p-3 rounded-xl text-2xs"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="font-semibold text-slate-400 mb-1">Demo accounts</p>
            <p className="text-slate-600">free@test.com &nbsp;|&nbsp; pro@test.com &nbsp;|&nbsp; premium@test.com</p>
            <p className="text-slate-600 mt-0.5">Password: <span className="text-slate-400 font-mono">Password123!</span></p>
          </div>

          <p className="mt-4 text-center text-xs text-slate-600">
            No account?{' '}
            <Link to="/signup" className="font-semibold transition-colors duration-150" style={{ color: '#fbbf24' }}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
