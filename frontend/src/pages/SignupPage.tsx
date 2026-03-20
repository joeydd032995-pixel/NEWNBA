import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
      const msg = err.response?.data?.message
      if (msg) {
        toast.error(msg)
      } else if (err.request && !err.response) {
        toast.error('Cannot reach the server. Please check that the backend is running.')
      } else {
        toast.error('Signup failed. Please try again.')
      }
    }
  }

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none opacity-25"
           style={{ background: 'radial-gradient(circle, rgba(223,142,255,0.3) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full pointer-events-none opacity-20"
           style={{ background: 'radial-gradient(circle, rgba(0,244,254,0.2) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      <div className="w-full max-w-sm relative animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg, rgba(223,142,255,0.2), rgba(0,244,254,0.1))', border: '1px solid rgba(223,142,255,0.3)', boxShadow: '0 0 32px rgba(223,142,255,0.2)' }}>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>sports_basketball</span>
          </div>
          <h1 className="text-3xl font-black font-headline tracking-tighter text-on-surface">NEWNBA</h1>
          <p className="text-on-surface-variant text-sm mt-1">Create your analytics account</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10"
             style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
          <h2 className="text-lg font-headline font-bold text-on-surface mb-6">Create your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm" htmlFor="firstName">First Name</label>
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
                <label className="label-sm" htmlFor="lastName">Last Name</label>
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
              <label className="label-sm" htmlFor="email">Email address</label>
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
              <label className="label-sm" htmlFor="password">Password</label>
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
              className="btn-primary w-full py-3 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-on-primary-container/30 border-t-on-primary-container rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_add</span>
                  Create Account
                </span>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-on-surface-variant">
            Already have an account?{' '}
            <Link to="/login" className="font-headline font-bold text-primary hover:brightness-110 transition-all">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
