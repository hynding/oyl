import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserDailyBarcodeButton from './UserDailyBarcodeButton'

vi.mock('./UserDailyBarcodeScanner', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="scanner">scanner</div> : null,
}))

describe('UserDailyBarcodeButton', () => {
  it('opens scanner on click', () => {
    render(<UserDailyBarcodeButton onBarcode={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))
    expect(screen.getByTestId('scanner')).toBeInTheDocument()
  })
})
