interface HealthWarningModalProps {
  title: string
  message: string
  onClose: () => void
}

export function HealthWarningModal({title, message, onClose}: HealthWarningModalProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-6" style={{zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.38)'}}>
      <div className="w-full max-w-sm bg-white rounded-2xl px-5 py-6 shadow-elegant">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center justify-center rounded-full" style={{width: '52px', height: '52px', backgroundColor: '#FFF7ED'}}>
            <div className="i-mdi-alert-circle text-3xl" style={{color: '#EA580C'}} />
          </div>
          <p className="text-2xl font-semibold text-foreground">{title}</p>
          <p className="text-xl text-muted-foreground leading-relaxed">{message}</p>
          <button
            type="button"
            className="w-full flex items-center justify-center text-xl font-semibold text-white bg-primary rounded-xl mt-2"
            style={{height: '48px'}}
            onClick={onClose}
          >我知道了</button>
        </div>
      </div>
    </div>
  )
}
