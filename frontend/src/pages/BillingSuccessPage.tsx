import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { useAuthStore } from '../stores/auth'

export default function BillingSuccessPage() {
  const navigate = useNavigate()
  const { loadProfile } = useAuthStore()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    loadProfile().then(() => {
      timer = setTimeout(() => navigate('/'), 3000)
    })
    return () => clearTimeout(timer)
  }, [loadProfile, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center gap-4">
      <CheckCircle size={56} className="text-emerald-400" />
      <h1 className="text-2xl font-bold text-white">Subscription activated!</h1>
      <p className="text-slate-400">Redirecting you to the dashboard…</p>
    </div>
  )
}
