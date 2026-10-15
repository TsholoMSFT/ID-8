import { useState } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { ENTITY_TYPE_LABELS, type Customer, type EntityType, type Industry } from '@/lib/types'
import { industryLabels } from '@/lib/discovery-questions'
import { NavigationHeader } from './NavigationHeader'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ArrowRight, Buildings } from '@phosphor-icons/react'

export interface WorkspaceSetupValues {
  customerName: string
  entityType: EntityType
  industry: Industry
}

export function WorkspaceSetup({ customers, onCreate, onCancel }: {
  customers: Customer[]
  onCreate: (values: WorkspaceSetupValues) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useLocalStorage<WorkspaceSetupValues>('workspace-setup-draft', {
    customerName: '', entityType: 'public-company', industry: 'general',
  })
  const [error, setError] = useState('')
  const existing = customers.find((customer) => customer.name.trim().toLowerCase() === draft.customerName.trim().toLowerCase())

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader onBackToLanding={onCancel} title="Start a customer workspace" hasPageHeading />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
        <Card>
          <CardHeader>
            <Buildings size={28} className="mb-2 text-primary" />
            <CardTitle className="text-2xl"><h1>Who are you working with?</h1></CardTitle>
            <CardDescription>Start with a customer name. Add contacts and other details later.</CardDescription>
          </CardHeader>
          <form onSubmit={(event) => {
            event.preventDefault()
            if (!draft.customerName.trim()) {
              setError('Enter a customer name to continue.')
              return
            }
            onCreate({ ...draft, customerName: draft.customerName.trim() })
            setDraft({ customerName: '', entityType: 'public-company', industry: 'general' })
          }}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="workspace-customer-name">Customer name</Label>
                <Input id="workspace-customer-name" autoFocus autoComplete="organization"
                  value={draft.customerName} aria-invalid={!!error} aria-describedby={error ? 'workspace-setup-error' : undefined}
                  onChange={(event) => { setDraft({ ...draft, customerName: event.target.value }); setError('') }}
                  placeholder="e.g. ABSA" />
                {existing && <p className="text-sm text-muted-foreground">This customer already exists. We will open their saved workspace.</p>}
                {error && <p id="workspace-setup-error" role="alert" className="text-sm text-destructive">{error}</p>}
              </div>
              {!existing && <>
                <div className="space-y-2">
                  <Label htmlFor="workspace-organization-type">Organization type</Label>
                  <Select value={draft.entityType} onValueChange={(value: EntityType) => setDraft({ ...draft, entityType: value })}>
                    <SelectTrigger id="workspace-organization-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-industry">Industry</Label>
                  <Select value={draft.industry} onValueChange={(value: Industry) => setDraft({ ...draft, industry: value })}>
                    <SelectTrigger id="workspace-industry"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(industryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>}
              <p className="text-xs text-muted-foreground">Creating a workspace does not run AI. Work is stored in this browser on this device.</p>
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-3">
              <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button type="submit" className="gap-2">{existing ? 'Open workspace' : 'Create workspace'}<ArrowRight size={16} /></Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  )
}
