import { db, auditLogs } from '@finance-os/db'

export type AuditInput = {
  actorType: 'user' | 'api_key' | 'scheduler' | 'ai_chat'
  actorId: string
  action: string // e.g. 'wallet.create'
  resourceType: string // e.g. 'wallet'
  resourceId: string
  metadata?: Record<string, unknown>
}

/** Append-only audit trail. Never throws — auditing must not break the mutation. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    })
  } catch (err) {
    console.error('audit write failed:', err)
  }
}
