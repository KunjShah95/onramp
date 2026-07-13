import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Spinner, ArrowLeft, UserPlus } from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { acceptInvite } from '../lib/api'
import { useToast } from '../context/ToastContext'

export default function JoinPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [teamName, setTeamName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('No invite token found in URL.')
      return
    }

    acceptInvite(token)
      .then(res => {
        setTeamName(res.team_name)
        setStatus('success')
        toast.success('Joined team', `You've joined ${res.team_name}`)
        setTimeout(() => navigate('/my-progress', { replace: true }), 3000)
      })
      .catch(err => {
        setStatus('error')
        setErrorMsg(err.message || 'Failed to accept invite')
        toast.error('Invite failed', err.message || 'Failed to accept invite')
      })
  }, [token, navigate])

  return (
    <PageTransition>
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-md"
          >
            <CardSpotlight className="p-8 text-center">
              {status === 'loading' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                    <Spinner className="w-7 h-7 text-accent-primary animate-spin" weight="bold" />
                  </div>
                  <div>
                    <GradientHeading as="h2" className="text-xl mb-2">Joining Team...</GradientHeading>
                    <p className="text-sm text-text-secondary">Accepting your invitation</p>
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"
                  >
                    <UserPlus className="w-7 h-7 text-green-400" weight="fill" />
                  </motion.div>
                  <div>
                    <GradientHeading as="h2" className="text-xl mb-2">Welcome!</GradientHeading>
                    <p className="text-text-primary mb-1">
                      You've joined <span className="font-bold text-accent-primary">{teamName}</span>
                    </p>
                    <p className="text-xs text-text-tertiary">Redirecting to your dashboard...</p>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <X className="w-7 h-7 text-red-400" weight="bold" />
                  </div>
                  <div>
                    <GradientHeading as="h2" className="text-xl mb-2">Invite Error</GradientHeading>
                    <p className="text-sm text-red-400 mb-2">{errorMsg}</p>
                    <p className="text-xs text-text-tertiary">Try asking your team lead to send a new invitation.</p>
                  </div>
                  <Link
                    to="/login"
                    className="flex items-center gap-2 text-sm text-accent-primary hover:underline mt-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to login
                  </Link>
                </div>
              )}
            </CardSpotlight>
          </motion.div>
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
