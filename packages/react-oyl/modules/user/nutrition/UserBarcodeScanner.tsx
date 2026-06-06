import { useRef, useState } from 'react'
import { useBarcodeScanner } from '@/modules/nutrition/openfoodfacts'

export default function UserBarcodeScanner({
  open, onClose, onBarcode,
}: { open: boolean; onClose: () => void; onBarcode: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [manual, setManual] = useState('')
  const { error } = useBarcodeScanner({ videoRef, onDetected: onBarcode, enabled: open })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      {!error && (
        <div className="relative w-full max-w-md aspect-square bg-black rounded overflow-hidden">
          <video ref={videoRef} data-testid="scanner-video" autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/4 h-1/3 border-2 border-white/70 rounded" />
          </div>
        </div>
      )}
      {error && (
        <div className="text-white text-center max-w-md">
          {error === 'permission-denied' && 'Camera permission denied.'}
          {error === 'no-camera' && 'No camera available.'}
          {error === 'decode-failed' && 'Couldn’t use the camera scanner.'}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 w-full max-w-md">
        <input
          type="text" inputMode="numeric"
          placeholder="Enter barcode manually"
          value={manual}
          onChange={e => setManual(e.target.value)}
          className="px-3 py-2 rounded bg-white text-black"
        />
        <div className="flex gap-2">
          <button
            onClick={() => manual.length >= 8 && onBarcode(manual)}
            disabled={manual.length < 8}
            className="flex-1 px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >Use barcode</button>
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded bg-gray-200">Cancel</button>
        </div>
      </div>
    </div>
  )
}
