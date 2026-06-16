import { useState, useEffect } from 'react'

export function Typewriter({ 
  text, 
  delay = 30, 
  onComplete 
}: { 
  text: string; 
  delay?: number; 
  onComplete?: () => void 
}) {
  const [currentText, setCurrentText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setCurrentText(prevText => prevText + text[currentIndex])
        setCurrentIndex(prevIndex => prevIndex + 1)
      }, delay)
  
      return () => clearTimeout(timeout)
    } else if (onComplete) {
      onComplete()
    }
  }, [currentIndex, delay, text, onComplete])

  return <span>{currentText}</span>
}

export function TerminalDemo({ command = 'codeflow analyze https://github.com/facebook/react' }: { command?: string }) {
  const [step, setStep] = useState(0)

  return (
    <div className="font-mono text-xs leading-relaxed text-slate-400">
      <div className="flex text-accent-from">
        <span className="mr-2">$</span>
        <Typewriter
          text={command}
          delay={40}
          onComplete={() => setTimeout(() => setStep(1), 400)}
        />
      </div>
      
      {step >= 1 && (
        <div className="mt-2 text-slate-300">
          <Typewriter 
            text="> Fetching repository... [Done]" 
            delay={10} 
            onComplete={() => setTimeout(() => setStep(2), 300)} 
          />
        </div>
      )}
      
      {step >= 2 && (
        <div className="text-slate-300">
          <Typewriter 
            text="> Analyzing architecture... [Done]" 
            delay={10} 
            onComplete={() => setTimeout(() => setStep(3), 500)} 
          />
        </div>
      )}

      {step >= 3 && (
        <div className="text-slate-300">
          <Typewriter 
            text="> Mapping dependencies... [Done]" 
            delay={10} 
            onComplete={() => setTimeout(() => setStep(4), 400)} 
          />
        </div>
      )}

      {step >= 4 && (
        <div className="mt-3">
          <Typewriter 
            text="Success: Analysis complete in 124ms." 
            delay={20} 
            onComplete={() => setTimeout(() => setStep(5), 300)} 
          />
        </div>
      )}

      {step >= 5 && (
        <div className="text-slate-400">
          <Typewriter 
            text="Generated learning path available at localhost:3000/report" 
            delay={20} 
          />
        </div>
      )}
      
      {/* Blinking cursor */}
      {step < 5 && (
        <span className="inline-block w-2 h-4 bg-accent-from animate-pulse ml-1 align-middle" />
      )}
    </div>
  )
}
