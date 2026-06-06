import { useState } from 'react'
import UserBarcodeScanner from './UserBarcodeScanner'

export default function UserBarcodeButton({ onBarcode }: { onBarcode: (b: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Scan barcode" className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700">📷 Scan</button>
      <UserBarcodeScanner open={open} onClose={() => setOpen(false)} onBarcode={(b) => { setOpen(false); onBarcode(b) }} />
    </>
  )
}
