import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserBarcodeScanner from './UserBarcodeScanner'

vi.mock('@/modules/nutrition/openfoodfacts', async (original) => {
  const actual = await original<typeof import('@/modules/nutrition/openfoodfacts')>()
  return { ...actual, useBarcodeScanner: () => ({ error: null, mode: 'native' as const }) }
})

describe('UserBarcodeScanner', () => {
  it('renders video element when no error', () => {
    render(<UserBarcodeScanner open onClose={vi.fn()} onBarcode={vi.fn()} />)
    expect(screen.getByTestId('scanner-video')).toBeInTheDocument()
  })

  it('manual entry triggers onBarcode', () => {
    const onBarcode = vi.fn()
    render(<UserBarcodeScanner open onClose={vi.fn()} onBarcode={onBarcode} />)
    fireEvent.change(screen.getByPlaceholderText(/enter barcode/i), { target: { value: '1234567890123' } })
    fireEvent.click(screen.getByRole('button', { name: /use barcode/i }))
    expect(onBarcode).toHaveBeenCalledWith('1234567890123')
  })
})
