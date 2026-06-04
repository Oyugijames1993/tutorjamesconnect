import { useRef, useCallback } from 'react'

export const SOUND_PROFILES = [
  { id: 'chime',   label: 'Chime',   description: 'Soft two-tone bell' },
  { id: 'ping',    label: 'Ping',    description: 'Single clean ping' },
  { id: 'pop',     label: 'Pop',     description: 'Gentle bubble pop' },
  { id: 'bell',    label: 'Bell',    description: 'Classic bell ring' },
  { id: 'digital', label: 'Digital', description: 'Short digital beep' },
  { id: 'marimba', label: 'Marimba', description: 'Warm marimba tap' },
]

export default function useNotificationSound() {
  const audioCtxRef = useRef(null)

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const playSound = useCallback((type = 'message', profileId = 'chime') => {
    try {
      const ctx = getCtx()
      const now = ctx.currentTime

      const profiles = {
        chime: {
          message: [
            { freq: 880,  start: 0,   duration: 0.12, gain: 0.25, wave: 'sine' },
            { freq: 1100, start: 0.1, duration: 0.18, gain: 0.18, wave: 'sine' },
          ],
          pending: [
            { freq: 440, start: 0,    duration: 0.15, gain: 0.20, wave: 'sine' },
            { freq: 554, start: 0.13, duration: 0.20, gain: 0.16, wave: 'sine' },
          ],
        },
        ping: {
          message: [
            { freq: 1480, start: 0, duration: 0.25, gain: 0.22, wave: 'sine' },
          ],
          pending: [
            { freq: 880, start: 0, duration: 0.25, gain: 0.22, wave: 'sine' },
          ],
        },
        pop: {
          message: [
            { freq: 300, start: 0,    duration: 0.04, gain: 0.30, wave: 'sine' },
            { freq: 600, start: 0.03, duration: 0.08, gain: 0.18, wave: 'sine' },
          ],
          pending: [
            { freq: 200, start: 0,    duration: 0.04, gain: 0.30, wave: 'sine' },
            { freq: 400, start: 0.03, duration: 0.08, gain: 0.18, wave: 'sine' },
          ],
        },
        bell: {
          message: [
            { freq: 987,  start: 0, duration: 0.4, gain: 0.22, wave: 'sine' },
            { freq: 1318, start: 0, duration: 0.3, gain: 0.10, wave: 'sine' },
            { freq: 1976, start: 0, duration: 0.2, gain: 0.06, wave: 'sine' },
          ],
          pending: [
            { freq: 523, start: 0, duration: 0.4, gain: 0.22, wave: 'sine' },
            { freq: 659, start: 0, duration: 0.3, gain: 0.10, wave: 'sine' },
          ],
        },
        digital: {
          message: [
            { freq: 1200, start: 0,    duration: 0.06, gain: 0.20, wave: 'square' },
            { freq: 1600, start: 0.07, duration: 0.06, gain: 0.16, wave: 'square' },
          ],
          pending: [
            { freq: 800, start: 0,    duration: 0.06, gain: 0.20, wave: 'square' },
            { freq: 600, start: 0.07, duration: 0.06, gain: 0.16, wave: 'square' },
          ],
        },
        marimba: {
          message: [
            { freq: 784,  start: 0,    duration: 0.3,  gain: 0.28, wave: 'triangle' },
            { freq: 1046, start: 0.12, duration: 0.25, gain: 0.20, wave: 'triangle' },
          ],
          pending: [
            { freq: 523, start: 0,    duration: 0.3,  gain: 0.28, wave: 'triangle' },
            { freq: 659, start: 0.12, duration: 0.25, gain: 0.20, wave: 'triangle' },
          ],
        },
      }

      const profile = profiles[profileId] || profiles.chime
      const tones   = profile[type] || profile.message

      tones.forEach(({ freq, start, duration, gain, wave }) => {
        const oscillator = ctx.createOscillator()
        const gainNode   = ctx.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(ctx.destination)

        oscillator.type = wave || 'sine'
        oscillator.frequency.setValueAtTime(freq, now + start)

        gainNode.gain.setValueAtTime(0, now + start)
        gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.02)
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + start + duration)

        oscillator.start(now + start)
        oscillator.stop(now + start + duration + 0.05)
      })
    } catch (err) {
      console.warn('Notification sound failed:', err)
    }
  }, [getCtx])

  return { playSound }
}