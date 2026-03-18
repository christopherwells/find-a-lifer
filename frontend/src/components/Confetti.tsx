import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9', '#FF7979', '#7ED6DF', '#E056A0']
const PARTICLE_COUNT = 25

interface Particle {
  id: number
  x: number
  color: string
  size: number
  delay: number
  drift: number
  shape: 'square' | 'circle'
}

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 6,
    delay: Math.random() * 0.8,
    drift: -30 + Math.random() * 60,
    shape: Math.random() > 0.5 ? 'square' : 'circle',
  }))
}

export default function Confetti({ active }: { active: boolean }) {
  const [expired, setExpired] = useState(false)

  // Generate new particles each time active becomes true
  const particles = useMemo(() => active ? generateParticles() : [], [active])

  // Auto-expire after 3 seconds; reset when active changes
  useEffect(() => { // eslint-disable-line react-hooks/set-state-in-effect -- timer-based visibility toggle
    if (!active) { setExpired(false); return }
    const timer = setTimeout(() => setExpired(true), 3000)
    return () => clearTimeout(timer)
  }, [active])

  if (!active || expired) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className={p.shape === 'circle' ? 'rounded-full' : ''}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: '-10px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `confetti-fall 2.5s ease-in ${p.delay}s forwards`,
            transform: `translateX(${p.drift}px)`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
