interface HealthMarkProps {
  size?: number
  className?: string
}

export function HealthBrandMark({size = 48, className = ''}: HealthMarkProps) {
  const leafSize = Math.round(size * 0.42)

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{width: `${size}px`, height: `${size}px`}}
    >
      <div className="i-lucide-scan-line absolute inset-0" style={{width: `${size}px`, height: `${size}px`}} />
      <div
        className="i-lucide-leaf absolute"
        style={{width: `${leafSize}px`, height: `${leafSize}px`, transform: 'rotate(-8deg)'}}
      />
    </div>
  )
}

export function HealthAdvisorMark({size = 48, className = ''}: HealthMarkProps) {
  const bubbleSize = Math.round(size * 0.8)
  const sparkleSize = Math.max(9, Math.round(size * 0.34))

  return (
    <div
      className={`relative flex items-end justify-start ${className}`}
      style={{width: `${size}px`, height: `${size}px`}}
    >
      <div
        className="i-lucide-message-circle-more"
        style={{width: `${bubbleSize}px`, height: `${bubbleSize}px`}}
      />
      <div
        className="i-lucide-sparkles absolute"
        style={{width: `${sparkleSize}px`, height: `${sparkleSize}px`, top: 0, right: 0}}
      />
    </div>
  )
}
