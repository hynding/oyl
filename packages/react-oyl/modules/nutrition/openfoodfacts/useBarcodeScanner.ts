import { useEffect, useRef, useState } from 'react'

type ScanError = 'permission-denied' | 'no-camera' | 'decode-failed' | null
type ScanMode = 'idle' | 'native' | 'zxing'

type Args = {
  videoRef: { current: HTMLVideoElement | null }
  onDetected: (barcode: string) => void
  enabled: boolean
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export function useBarcodeScanner({ videoRef, onDetected, enabled }: Args) {
  const [error, setError] = useState<ScanError>(null)
  const [mode, setMode] = useState<ScanMode>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        if ('BarcodeDetector' in globalThis) {
          setMode('native')
          await runNative(cancelled, videoRef, onDetected, setError)
        } else {
          setMode('zxing')
          await runZxing(cancelled, videoRef, onDetected, setError, stopRef)
        }
      } catch (err) {
        const name = (err as { name?: string }).name
        if (name === 'NotAllowedError') setError('permission-denied')
        else if (name === 'NotFoundError') setError('no-camera')
        else setError('decode-failed')
      }
    }

    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      stopRef.current?.()
      stopRef.current = null
    }
  }, [enabled, videoRef, onDetected])

  return { error, mode }
}

async function runNative(
  cancelledFlag: boolean,
  videoRef: { current: HTMLVideoElement | null },
  onDetected: (b: string) => void,
  setError: (e: ScanError) => void,
) {
  const Ctor = (globalThis as unknown as { BarcodeDetector: new (opts: { formats: readonly string[] }) => { detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
  const detector = new Ctor({ formats: FORMATS })
  while (!cancelledFlag && videoRef.current) {
    try {
      const results = await detector.detect(videoRef.current)
      if (results.length > 0) { onDetected(results[0].rawValue); return }
    } catch {
      setError('decode-failed'); return
    }
    await new Promise(r => setTimeout(r, 200))
  }
}

async function runZxing(
  cancelledFlag: boolean,
  videoRef: { current: HTMLVideoElement | null },
  onDetected: (b: string) => void,
  setError: (e: ScanError) => void,
  stopRef: { current: (() => void) | null },
) {
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    if (!videoRef.current || cancelledFlag) return
    const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
      if (result) onDetected(result.getText())
    })
    stopRef.current = () => controls.stop()
  } catch {
    setError('decode-failed')
  }
}
