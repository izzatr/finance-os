import { avatarMark, type HoldingIdentity } from '@/lib/investments'

const TONES: Record<string, string> = {
  commodity: 'bg-[#f5dfb3] text-[#6b4a12]',
  crypto: 'bg-[#0e1729] text-[#f5dfb3]',
  mutual_fund: 'bg-[#e3ece6] text-[#1f5137]',
  etf: 'bg-[#e4e8f1] text-[#1c2740]',
  stock: 'bg-[var(--tint)] text-[var(--ink)]',
}

/** Round mark per holding. No logos are fetched; the type colour keeps the list scannable. */
export function HoldingAvatar({ identity, size = 40 }: { identity: HoldingIdentity; size?: number }) {
  const mark = avatarMark(identity)
  const fontSize = mark.length >= 4 ? size * 0.26 : mark.length === 3 ? size * 0.3 : size * 0.36
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold tracking-[-0.02em] ${TONES[identity.type ?? 'stock'] ?? TONES.stock}`}
      style={{ width: size, height: size, fontSize }}
    >
      {mark}
    </span>
  )
}
