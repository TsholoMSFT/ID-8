import type { ReactNode } from 'react'
import type { Customer, DiscoverySession } from '@/lib/types'
import { WORKSPACE_STEPS, type WorkspaceStep } from '@/lib/app-navigation'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ArrowRight, FloppyDisk } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface WorkspaceNavigationProps {
  customers: Customer[]
  sessions: DiscoverySession[]
  customer: Customer
  session: DiscoverySession
  step: WorkspaceStep
  onSelectSession: (session: DiscoverySession) => void
  onSelectCustomer: (customerId: string) => void
  onStepChange: (step: WorkspaceStep) => void
  actions?: ReactNode
}

export function WorkspaceNavigation({
  customers, sessions, customer, session, step, onSelectSession, onSelectCustomer, onStepChange, actions,
}: WorkspaceNavigationProps) {
  const currentIndex = WORKSPACE_STEPS.findIndex((item) => item.id === step)
  const customerSessions = sessions.filter((item) => item.customerId === customer.id)
  return (
    <section aria-label="Customer workspace" className="mb-8 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer workspace</p>
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{customer.name}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FloppyDisk size={14} />Stored in this browser</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 space-y-1 sm:w-48">
            <Label htmlFor="workspace-customer" className="text-xs">Customer</Label>
            <Select value={customer.id} onValueChange={onSelectCustomer}>
              <SelectTrigger id="workspace-customer"><SelectValue /></SelectTrigger>
              <SelectContent>{customers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {customerSessions.length > 1 && (
            <div className="min-w-0 space-y-1 sm:w-56">
              <Label htmlFor="workspace-session" className="text-xs">Session</Label>
              <Select value={session.id} onValueChange={(id) => {
                const next = customerSessions.find((item) => item.id === id)
                if (next) onSelectSession(next)
              }}>
                <SelectTrigger id="workspace-session"><SelectValue /></SelectTrigger>
                <SelectContent>{customerSessions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {actions}
        </div>
      </div>
      <nav aria-label="Workspace steps">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {WORKSPACE_STEPS.map((item, index) => (
            <li key={item.id}>
              <button type="button" onClick={() => onStepChange(item.id)} aria-current={step === item.id ? 'step' : undefined}
                className={cn('flex min-h-12 w-full items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  step === item.id ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-border text-muted-foreground')}>
                <span aria-hidden="true" className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs', step === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{index + 1}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{WORKSPACE_STEPS[currentIndex].label}</h2>
          <p className="text-sm text-muted-foreground">{WORKSPACE_STEPS[currentIndex].description}</p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">Step {currentIndex + 1} of {WORKSPACE_STEPS.length}</p>
      </div>
    </section>
  )
}

export function WorkspaceContinue({ step, onStepChange }: { step: WorkspaceStep; onStepChange: (step: WorkspaceStep) => void }) {
  const index = WORKSPACE_STEPS.findIndex((item) => item.id === step)
  const next = WORKSPACE_STEPS[index + 1]
  if (!next) return null
  return (
    <div className="mt-8 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{step === 'research' ? 'Research is optional. Continue when you are ready.' : 'Your work stays available when you move between steps.'}</p>
      <Button onClick={() => onStepChange(next.id)} className="gap-2">Continue to {next.label}<ArrowRight size={16} /></Button>
    </div>
  )
}
