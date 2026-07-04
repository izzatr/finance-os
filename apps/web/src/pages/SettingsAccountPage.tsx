import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Copy, Check, Trash2, Key, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { listApiKeys, createApiKey, revokeApiKey, apiKeyScope, type ApiKeyScope } from '@/lib/auth'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function SettingsAccountPage() {
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const user = state.status === 'authenticated' ? state.user : null

  // ── API Keys ────────────────────────────────────────────────────────────────

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: listApiKeys,
  })

  const createMutation = useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: ApiKeyScope }) => createApiKey(name, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const [newKey, setNewKey] = useState<{ name: string; value: string } | null>(null)

  const handleCreateKey = async () => {
    const name = window.prompt('Enter a name for this API key:')
    if (!name) return
    const scopeInput = window.prompt(
      'Key scope — read (view only), propose (writes wait in your approval inbox), or write (full access):',
      'propose',
    )
    if (scopeInput === null) return
    const trimmed = scopeInput.trim().toLowerCase()
    const scope: ApiKeyScope = trimmed === 'read' || trimmed === 'write' ? trimmed : 'propose'
    try {
      const created = await createMutation.mutateAsync({ name, scope })
      if (created.key) {
        setNewKey({ name: created.name ?? name, value: created.key })
      }
    } catch {
      // error handled inline
    }
  }

  const handleRevokeKey = async (id: string) => {
    if (!window.confirm('Revoke this API key? This action cannot be undone.')) return
    try {
      await revokeMutation.mutateAsync(id)
    } catch {
      // error handled inline
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <main className="max-w-[720px] px-8 md:px-12 pb-24">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-all hover:border-[rgba(91,164,212,0.4)] hover:bg-white/90 hover:text-foreground no-underline"
        >
          <ArrowLeft size={13} />
          Back
        </Link>
        <h1 className="font-heading text-2xl font-medium text-foreground">Account Settings</h1>
      </div>

      <div className="flex flex-col gap-6">
        {/* Profile section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your personal information</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {user ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="display-name" className="text-sm font-medium">Display name</label>
                  <Input
                    id="display-name"
                    defaultValue={user.name ?? ''}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium">Email</label>
                  <Input
                    id="email"
                    type="email"
                    value={user.email}
                    readOnly
                    className="cursor-not-allowed opacity-60"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email changes require verification. Contact support to update your address.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading user information…</p>
            )}
          </CardContent>
        </Card>

        {/* Security section */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Change password</p>
                <p className="text-xs text-muted-foreground">Update your account password</p>
              </div>
              <Button variant="outline" size="sm" render={<Link to="/settings/change-password" />}>
                Change password
              </Button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">Sign out of your Finance OS account</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut size={13} />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* API Keys section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={15} className="text-muted-foreground" />
                <CardTitle>API Keys</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={handleCreateKey} disabled={createMutation.isPending}>
                <Plus size={13} />
                Create new key
              </Button>
            </div>
            <CardDescription>API keys let your AI agents and scripts authenticate with Finance OS.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Newly created key display */}
            {newKey && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-foreground">{newKey.name}</p>
                  <Badge variant="outline" className="text-xs">Newly created — copy now</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground break-all">
                    {newKey.value}
                  </code>
                  <CopyButton value={newKey.value} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  This key will not be shown again. Store it securely.
                </p>
                <button
                  onClick={() => setNewKey(null)}
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Error state */}
            {(createMutation.isError || revokeMutation.isError) && (
              <p className="text-xs text-destructive">
                {createMutation.error?.message ?? revokeMutation.error?.message ?? 'An error occurred'}
              </p>
            )}

            {/* Keys list */}
            {keysQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading API keys…</p>
            ) : keysQuery.isError ? (
              <p className="text-sm text-destructive">
                Failed to load API keys: {keysQuery.error?.message ?? 'Unknown error'}
              </p>
            ) : keysQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys yet. Create one to get started.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {keysQuery.data?.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-white/50 px-3 py-2.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{key.name ?? '(unnamed)'}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          apiKeyScope(key) === 'write'
                            ? 'bg-[color-mix(in_srgb,var(--negative)_12%,white)] text-[var(--negative)]'
                            : apiKeyScope(key) === 'propose'
                              ? 'bg-[var(--accent-dim)] text-[var(--accent-blue)]'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {apiKeyScope(key)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(key.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleRevokeKey(key.id)}
                      disabled={revokeMutation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}