import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dumbbell, UserPlus } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const [form, setForm]      = useState({ email: '', password: '', firstName: '', lastName: '' })
  const { signup, isLoading} = useAuthStore()
  const navigate             = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await signup(form)
      toast.success('Account created!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Signup failed')
    }
  }

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #040812 0%, #080d1a 60%, #060b15 100%)' }}
    >
      {/* Background glow orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none opacity-20"
           style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full pointer-events-none opacity-15"
           style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', boxShadow: '0 0 32px rgba(245,158,11,0.35)' }}>
            <Dumbbell size={26} style={{ color: '#040812' }} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NEWNBA</h1>
          <p className="text-slate-500 text-sm mt-1">Create your analytics account</p>
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
          <h2 className="text-base font-semibold text-white mb-5">Create your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  value={form.firstName}
                  onChange={update('firstName')}
                  className="input-field"
                  placeholder="Jordan"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  value={form.lastName}
                  onChange={update('lastName')}
                  className="input-field"
                  placeholder="Smith"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update('email')}
                className="input-field"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={update('password')}
                className="input-field"
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-3.5 h-3.5 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <UserPlus size={14} />
                  Create Account
                </span>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold transition-colors duration-150" style={{ color: '#fbbf24' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
