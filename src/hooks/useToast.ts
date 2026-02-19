import { useToastContext } from '@/components/ToastProvider'

export function useToast() {
  const ctx = useToastContext()
  return {
    show: ctx.show,
    success: ctx.success,
    error: ctx.error,
    info: ctx.info,
    dismiss: ctx.dismiss,
  }
}

export default useToast
