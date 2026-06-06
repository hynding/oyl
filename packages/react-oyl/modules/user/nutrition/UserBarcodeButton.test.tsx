import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserBarcodeButton from './UserBarcodeButton'

vi.mock('./UserBarcodeScanner', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="scanner">scanner</div> : null,
}))

describe('UserBarcodeButton', () => {
  it('opens scanner on click', () => {
    render(<UserBarcodeButton onBarcode={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    expect(screen.getByTestId('scanner')).toBeInTheDocument()
  })
})
