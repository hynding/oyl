import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeScanner } from './useBarcodeScanner'

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      configurable: true,
      value: class { async detect() { return [{ rawValue: '1234567890123' }] } },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    })
  })
  afterEach(() => {
    // @ts-expect-error - cleanup
    delete globalThis.BarcodeDetector
  })

  it('emits decoded barcode via onDetected', async () => {
    const onDetected = vi.fn()
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    renderHook(() => useBarcodeScanner({ videoRef, onDetected, enabled: true }))
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith('1234567890123'))
  })

  it('surfaces permission denied as typed error', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    )
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const { result } = renderHook(() => useBarcodeScanner({ videoRef, onDetected: vi.fn(), enabled: true }))
    await waitFor(() => expect(result.current.error).toBe('permission-denied'))
  })

  it('falls back to ZXing when BarcodeDetector missing', async () => {
    // @ts-expect-error - remove for this test
    delete globalThis.BarcodeDetector
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const onDetected = vi.fn()
    const { result } = renderHook(() => useBarcodeScanner({ videoRef, onDetected, enabled: true }))
    await waitFor(() => expect(result.current.mode).toBe('zxing'))
  })

  it('cleans up stream on unmount', async () => {
    const stop = vi.fn()
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      getTracks: () => [{ stop }],
    })
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const { unmount } = renderHook(() => useBarcodeScanner({ videoRef, onDetected: vi.fn(), enabled: true }))
    await act(async () => { await Promise.resolve() })
    unmount()
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
