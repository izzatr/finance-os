import type { SplitActivity } from './api'
import { formatAmount } from './split'

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** One plain sentence for an activity entry, built from its kind and data. */
export function activitySentence(a: SplitActivity): string {
  const actor = a.isMine ? 'You' : a.actorName ?? 'Someone'
  const d = a.data ?? {}
  const desc = str(d.description)
  const quoted = desc ? `"${desc}"` : 'an expense'
  const group = str(d.name) ?? a.groupName
  const inGroup = a.groupName ? ` in ${a.groupName}` : ''
  const cost = str(d.cost)
  const currency = str(d.currency)
  const amount = cost && currency ? formatAmount(cost, currency) : null

  switch (a.kind) {
    case 'expense.created':
      return `${actor} added ${quoted}${inGroup}`
    case 'expense.updated': {
      const prev = str(d.previousDescription)
      return prev && desc && prev !== desc ? `${actor} updated "${prev}" (now ${quoted})${inGroup}` : `${actor} updated ${quoted}${inGroup}`
    }
    case 'expense.deleted':
      return `${actor} deleted ${quoted}${inGroup}`
    case 'expense.restored':
      return `${actor} restored ${quoted}${inGroup}`
    case 'expense.repeated':
      return `${quoted} repeated${inGroup}`
    case 'payment.created':
      return `${actor} recorded a payment${amount ? ` of ${amount}` : ''}${inGroup}`
    case 'payment.updated':
      return `${actor} updated a payment${amount ? ` (now ${amount})` : ''}${inGroup}`
    case 'payment.deleted':
      return `${actor} deleted a payment${inGroup}`
    case 'payment.restored':
      return `${actor} restored a payment${inGroup}`
    case 'comment.added': {
      const comment = str(d.comment)
      return `${actor} commented on ${quoted}${comment ? `: "${comment}"` : ''}`
    }
    case 'group.created':
      return `${actor} created the group "${group ?? 'Group'}"`
    case 'group.updated': {
      const prev = str(d.previousName)
      const name = str(d.name) ?? a.groupName ?? 'the group'
      if (prev && prev !== name) return `${actor} renamed "${prev}" to "${name}"`
      if (typeof d.simplifyDebts === 'boolean') return `${actor} turned ${d.simplifyDebts ? 'on' : 'off'} simplify debts in "${name}"`
      return `${actor} updated "${name}"`
    }
    case 'group.deleted':
      return `${actor} deleted the group "${group ?? 'Group'}"`
    case 'group.restored':
      return `${actor} restored the group "${group ?? 'Group'}"`
    case 'group.member_added':
      return `${actor} added ${str(d.name) ?? 'someone'} to "${a.groupName ?? 'a group'}"`
    case 'group.member_removed':
      return `${actor} removed ${str(d.name) ?? 'someone'} from "${a.groupName ?? 'a group'}"`
    case 'group.left':
      return `${actor} left "${a.groupName ?? 'a group'}"`
    case 'friend.added':
      return `${actor} added ${str(d.name) ?? 'a friend'} as a friend`
    case 'person.joined': {
      const name = a.isMine ? 'You' : str(d.name) ?? a.actorName ?? 'Someone'
      const guest = str(d.guestName)
      return guest && guest !== str(d.name) ? `${name} joined (was ${guest})` : `${name} joined`
    }
    default:
      return `${actor} made a change${inGroup}`
  }
}

/** Where tapping an activity entry goes, if anywhere. */
export function activityLink(a: SplitActivity): string | null {
  if (a.expenseId) return `/shared/expenses/${a.expenseId}`
  if (a.groupId && a.kind !== 'group.deleted' && a.kind !== 'group.left') return `/shared/groups/${a.groupId}`
  return null
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "12 Oct". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso)
  const diff = (now.getTime() - t.getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400 && t.getDate() === now.getDate()) return `${Math.floor(diff / 3600)} h ago`
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (t.toDateString() === y.toDateString()) return 'Yesterday'
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}
