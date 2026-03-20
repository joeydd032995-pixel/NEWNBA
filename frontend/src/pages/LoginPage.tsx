import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none opacity-25"
           style={{ background: 'radial-gradient(circle, rgba(223,142,255,0.3) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none opacity-20"
           style={{ background: 'radial-gradient(circle, rgba(0,244,254,0.25) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      <div className="w-full max-w-sm relative animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, rgba(223,142,255,0.2), rgba(0,244,254,0.1))', border: '1px solid rgba(223,142,255,0.3)', boxShadow: '0 0 32px rgba(223,142,255,0.2)' }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>sports_basketball</span>
          </div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface">NEWNBA</h1>
          <p className="text-on-surface-variant text-sm mt-1">Sports Betting Analytics</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10"
             style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
          <h2 className="text-lg font-headline font-bold text-on-surface mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-sm" htmlFor="email">
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
              <label className="label-sm" htmlFor="password">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors duration-150"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-on-primary-container/30 border-t-on-primary-container rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>login</span>
                  Sign In
                </span>
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-5 p-3 rounded-xl bg-surface-container-high/60 border border-outline-variant/10">
            <p className="font-headline font-bold text-on-surface-variant text-xs mb-1">Demo accounts</p>
            <p className="text-on-surface-variant/60 text-xs">free@test.com &nbsp;|&nbsp; pro@test.com &nbsp;|&nbsp; premium@test.com</p>
            <p className="text-on-surface-variant/60 text-xs mt-0.5">Password: <span className="text-on-surface-variant font-mono">Password123!</span></p>
          </div>

          <p className="mt-5 text-center text-xs text-on-surface-variant">
            No account?{' '}
            <Link to="/signup" className="font-headline font-bold text-primary hover:brightness-110 transition-all">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
