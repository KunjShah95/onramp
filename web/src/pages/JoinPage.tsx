import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
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
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-[#0D0906] max-w-full overflow-x-hidden">
        <CardSpotlight className="max-w-md w-full p-8 space-y-6 text-center">
          {status === 'loading' && (
            <>
              <GradientHeading>Joining Team...</GradientHeading>
              <div className="flex justify-center">
                <div className="w-8 h-8 border-2 border-[#FF8C00] border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-[#FDFBF8]/40">
                Accepting your invitation...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <GradientHeading>Welcome!</GradientHeading>
              <div className="text-6xl">🎉</div>
              <p className="text-base text-[#FDFBF8]">
                You've joined <span className="font-bold text-[#FF8C00]">{teamName}</span>
              </p>
              <p className="text-xs text-[#FDFBF8]/30">
                Redirecting to your dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <GradientHeading>Invite Error</GradientHeading>
              <p className="text-sm text-red-400">{errorMsg}</p>
              <p className="text-xs text-[#FDFBF8]/30">
                Try asking your team lead to send a new invitation.
              </p>
            </>
          )}
        </CardSpotlight>
      </div>
    </PageTransition>
  )
}
