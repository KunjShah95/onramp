import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Spinner, ArrowLeft, UserPlus } from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
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

  const statusMeta = {
    loading: { rail: 'Team Invite', designator: 'JOINING', status: 'standby' as const },
    success: { rail: 'Team Invite', designator: 'ACCEPTED', status: 'go' as const },
    error: { rail: 'Team Invite', designator: 'DECLINED', status: 'abort' as const },
  }[status]

  return (
    <PageTransition>
      <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased">
      <div className="min-h-screen bg-bg-void flex items-center justify-center p-4 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-md"
          >
            <ConsolePanel rail={statusMeta.rail} designator={statusMeta.designator} status={statusMeta.status} className="text-center">
              {status === 'loading' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <div className="w-14 h-14 rounded-tile bg-mission/10 border border-mission/20 flex items-center justify-center">
                    <Spinner size={28} className="text-mission animate-spin" weight="bold" />
                  </div>
                  <div>
                    <h2 className="font-heading text-display-xs font-semibold text-ink mb-2">Joining Team...</h2>
                    <p className="text-caption text-ink-secondary">Accepting your invitation</p>
                  </div>
                </div>
              )}

              {status === 'success' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-14 h-14 rounded-tile bg-success-muted border border-success/20 flex items-center justify-center"
                  >
                    <UserPlus size={28} className="text-success" weight="fill" />
                  </motion.div>
                  <div>
                    <h2 className="font-heading text-display-xs font-semibold text-ink mb-2">Welcome!</h2>
                    <p className="text-body-sm text-ink-primary mb-1">
                      You've joined <span className="font-semibold text-go">{teamName}</span>
                    </p>
                    <p className="text-caption text-ink-muted">Redirecting to your dashboard...</p>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <div className="w-14 h-14 rounded-tile bg-error-muted border border-error/20 flex items-center justify-center">
                    <X size={28} className="text-error" weight="bold" />
                  </div>
                  <div>
                    <h2 className="font-heading text-display-xs font-semibold text-ink mb-2">Invite Error</h2>
                    <p className="text-caption text-error mb-2">{errorMsg}</p>
                    <p className="text-caption text-ink-muted">Try asking your team lead to send a new invitation.</p>
                  </div>
                  <Link
                    to="/login"
                    className="flex items-center gap-2 text-caption text-go hover:underline mt-2"
                  >
                    <ArrowLeft size={16} />
                    Back to login
                  </Link>
                </div>
              )}
            </ConsolePanel>
          </motion.div>
        </AnimatePresence>
      </div>
      </div>
    </PageTransition>
  )
}
