import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const { signup, isLoading } = useAuthStore()
  const navigate = useNavigate()

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Dumbbell size={32} className="text-primary-500" />
            <h1 className="text-2xl font-bold text-white">NBA Analytics</h1>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-6">Create Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">First Name</label>
                <input type="text" value={form.firstName} onChange={update('firstName')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Last Name</label>
                <input type="text" value={form.lastName} onChange={update('lastName')} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input type="email" value={form.email} onChange={update('email')} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <input type="password" value={form.password} onChange={update('password')} className="input-field" required minLength={8} />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-400">
            Already have an account? <Link to="/login" className="text-primary-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
