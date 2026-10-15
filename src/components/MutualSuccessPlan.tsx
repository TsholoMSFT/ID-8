/**
 * MutualSuccessPlan — Khalsa LGROLNP "Mutual Success Plan" artifact.
 *
 * Captures the customer-led contract that has to exist BEFORE you go solutioning:
 *   • Success criteria (in the customer's words)
 *   • Evidence required to prove success
 *   • Decision-makers and the decision date
 *   • What-would-have-to-be-true (testable assumptions)
 *   • Mutual commitments (customer side + Microsoft side)
 *
 * Persisted per customer in localStorage. Exportable to PDF for sign-off.
 */

import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Handshake, Plus, X, Download, CheckCircle, Question, Target, Users, FileText } from '@phosphor-icons/react'
import { useLocalStorage } from '@/hooks/use-local-storage'

// ────────────────────────────────────────────────────────────────────────────
// Type
// ────────────────────────────────────────────────────────────────────────────

export interface MutualSuccessPlan {
  customerId: string
  /** Success criteria in the customer's own words (Khalsa: their language, not yours). */
  successCriteria: string
  /** Concrete artefacts/measurements that prove success. */
  evidenceRequired: Array<{ id: string; text: string; verified?: boolean }>
  /** Who actually decides — name, role, role-in-the-decision (sponsor/approver/influencer). */
  decisionMakers: Array<{ id: string; name: string; role: string; roleInDecision: string }>
  /** Target decision date (ISO yyyy-mm-dd). */
  decisionDate?: string
  /** Testable assumptions — "What would have to be true for this to work?" */
  whatWouldHaveToBeTrue: Array<{ id: string; text: string; status?: 'unknown' | 'true' | 'false' }>
  /** Customer-side commitments — what the customer puts in. */
  customerCommitments: Array<{ id: string; text: string }>
  /** Microsoft-side commitments — what we put in. */
  microsoftCommitments: Array<{ id: string; text: string }>
  updatedAt: number
}

const blankPlan = (customerId: string): MutualSuccessPlan => ({
  customerId,
  successCriteria: '',
  evidenceRequired: [],
  decisionMakers: [],
  decisionDate: undefined,
  whatWouldHaveToBeTrue: [],
  customerCommitments: [],
  microsoftCommitments: [],
  updatedAt: Date.now(),
})

const newId = () => Math.random().toString(36).slice(2)

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  customerId: string | null
  customerName?: string | null
  /** Optional custom trigger element. If omitted, renders a default button. */
  trigger?: React.ReactNode
}

export function MutualSuccessPlanDialog({ customerId, customerName, trigger }: Props) {
  const storageKey = customerId ? `id8:mutual-success-plan:${customerId}` : 'id8:mutual-success-plan:none'
  const [plan, setPlan] = useLocalStorage<MutualSuccessPlan>(storageKey, blankPlan(customerId ?? ''))
  const [open, setOpen] = useState(false)

  const update = (patch: Partial<MutualSuccessPlan>) =>
    setPlan({ ...plan, ...patch, customerId: customerId ?? plan.customerId, updatedAt: Date.now() })

  const completionPct = computeCompletion(plan)

  const handleExport = () => {
    if (!customerId) {
      toast.error('Select a customer first')
      return
    }
    exportMutualSuccessPlanPdf(plan, customerName ?? 'Customer')
    toast.success('Mutual Success Plan exported')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!customerId}>
            <Handshake size={14} weight="duotone" />
            Mutual Success Plan
            {completionPct > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">
                {completionPct}%
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake size={20} weight="duotone" /> Mutual Success Plan
            {customerName && <span className="text-sm text-muted-foreground font-normal">— {customerName}</span>}
          </DialogTitle>
          <DialogDescription>
            Khalsa's mutual contract. Fill this in <em>before</em> committing to a solution. Every blank is a question
            that, left unasked, becomes a surprise during procurement.
          </DialogDescription>
        </DialogHeader>

        {!customerId ? (
          <p className="text-sm text-muted-foreground">Select a customer to start a plan.</p>
        ) : (
          <div className="space-y-4">
            {/* Success criteria */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target size={16} weight="duotone" /> Success criteria (customer's words)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={plan.successCriteria}
                  onChange={(e) => update({ successCriteria: e.target.value })}
                  placeholder='e.g. "Cut average claims-cycle time from 18 days to under 8 by Q3, with no drop in CSAT."'
                  className="w-full min-h-[80px] rounded border bg-background px-2 py-1.5 text-sm"
                />
              </CardContent>
            </Card>

            {/* Evidence */}
            <ListEditor
              icon={<CheckCircle size={16} weight="duotone" />}
              title="Evidence required"
              hint="What artefact / measurement proves success? Reports, dashboards, audit results."
              items={plan.evidenceRequired}
              onChange={(evidenceRequired) => update({ evidenceRequired })}
              renderExtra={(item, patch) => (
                <Button
                  size="sm"
                  variant={item.verified ? 'default' : 'ghost'}
                  className="h-7 text-[11px] gap-1"
                  onClick={() => patch({ verified: !item.verified })}
                >
                  <CheckCircle size={12} /> {item.verified ? 'Verified' : 'Unverified'}
                </Button>
              )}
              placeholder="e.g. Weekly claims-cycle dashboard signed off by Ops Director"
            />

            {/* Decision makers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users size={16} weight="duotone" /> Decision makers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-xs">Target decision date</Label>
                  <Input
                    type="date"
                    value={plan.decisionDate ?? ''}
                    onChange={(e) => update({ decisionDate: e.target.value || undefined })}
                    className="h-8 text-xs max-w-[200px]"
                  />
                </div>
                <div className="space-y-1">
                  {plan.decisionMakers.map((dm) => (
                    <div key={dm.id} className="flex gap-1">
                      <Input
                        value={dm.name}
                        placeholder="Name"
                        className="h-8 text-xs"
                        onChange={(e) =>
                          update({
                            decisionMakers: plan.decisionMakers.map((x) =>
                              x.id === dm.id ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Input
                        value={dm.role}
                        placeholder="Title"
                        className="h-8 text-xs"
                        onChange={(e) =>
                          update({
                            decisionMakers: plan.decisionMakers.map((x) =>
                              x.id === dm.id ? { ...x, role: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Input
                        value={dm.roleInDecision}
                        placeholder="Sponsor / Approver / Influencer"
                        className="h-8 text-xs"
                        onChange={(e) =>
                          update({
                            decisionMakers: plan.decisionMakers.map((x) =>
                              x.id === dm.id ? { ...x, roleInDecision: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() =>
                          update({ decisionMakers: plan.decisionMakers.filter((x) => x.id !== dm.id) })
                        }
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      update({
                        decisionMakers: [
                          ...plan.decisionMakers,
                          { id: newId(), name: '', role: '', roleInDecision: '' },
                        ],
                      })
                    }
                  >
                    <Plus size={12} className="mr-1" /> Add decision maker
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* What would have to be true */}
            <ListEditor
              icon={<Question size={16} weight="duotone" />}
              title="What would have to be true?"
              hint="Testable assumptions. If any are false, the plan doesn't work — surface them now."
              items={plan.whatWouldHaveToBeTrue}
              onChange={(whatWouldHaveToBeTrue) => update({ whatWouldHaveToBeTrue })}
              renderExtra={(item, patch) => (
                <select
                  aria-label="Status"
                  value={item.status ?? 'unknown'}
                  onChange={(e) => patch({ status: e.target.value as 'unknown' | 'true' | 'false' })}
                  className="h-7 rounded border bg-background px-1 text-[11px]"
                >
                  <option value="unknown">unknown</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
              placeholder="e.g. Customer's claims data is available in a queryable form"
            />

            {/* Commitments */}
            <div className="grid gap-3 md:grid-cols-2">
              <ListEditor
                icon={<Handshake size={16} weight="duotone" />}
                title="Customer commitments"
                hint="What the customer puts in."
                items={plan.customerCommitments}
                onChange={(customerCommitments) => update({ customerCommitments })}
                placeholder="e.g. Ops Director attends weekly steerco for 12 weeks"
              />
              <ListEditor
                icon={<Handshake size={16} weight="duotone" />}
                title="Microsoft commitments"
                hint="What we put in."
                items={plan.microsoftCommitments}
                onChange={(microsoftCommitments) => update({ microsoftCommitments })}
                placeholder="e.g. 2 architects + 1 PM, Mar 1 – Jun 30"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <span className="text-xs text-muted-foreground mr-auto">{completionPct}% complete</span>
          <Button variant="outline" onClick={handleExport} disabled={!customerId} className="gap-1.5">
            <Download size={14} /> Export PDF
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ListEditor — small reusable add/remove/edit list
// ────────────────────────────────────────────────────────────────────────────

interface ListItem {
  id: string
  text: string
  [k: string]: unknown
}

function ListEditor<T extends ListItem>({
  icon,
  title,
  hint,
  items,
  onChange,
  renderExtra,
  placeholder,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  items: T[]
  onChange: (items: T[]) => void
  renderExtra?: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode
  placeholder: string
}) {
  const patch = (id: string, p: Partial<T>) =>
    onChange(items.map((x) => (x.id === id ? { ...x, ...p } : x)))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">{icon} {title}</CardTitle>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex gap-1 items-center">
            <Input
              value={item.text}
              placeholder={placeholder}
              className="h-8 text-xs"
              onChange={(e) => patch(item.id, { text: e.target.value } as Partial<T>)}
            />
            {renderExtra?.(item, (p) => patch(item.id, p))}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onChange([...items, { id: newId(), text: '' } as T])}
        >
          <Plus size={12} className="mr-1" /> Add
        </Button>
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Completion heuristic
// ────────────────────────────────────────────────────────────────────────────

function computeCompletion(p: MutualSuccessPlan): number {
  const weights = [
    p.successCriteria.trim().length > 0 ? 1 : 0,
    p.evidenceRequired.length > 0 ? 1 : 0,
    p.decisionMakers.length > 0 ? 1 : 0,
    p.decisionDate ? 1 : 0,
    p.whatWouldHaveToBeTrue.length > 0 ? 1 : 0,
    p.customerCommitments.length > 0 ? 1 : 0,
    p.microsoftCommitments.length > 0 ? 1 : 0,
  ]
  return Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 100)
}

// ────────────────────────────────────────────────────────────────────────────
// PDF export
// ────────────────────────────────────────────────────────────────────────────

export function exportMutualSuccessPlanPdf(plan: MutualSuccessPlan, customerName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ creator: 'ID-8', title: 'ID-8 Mutual Success Plan' })
  const margin = 15
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const section = (title: string) => {
    ensureSpace(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 41, 59)
    doc.text(title, margin, y)
    y += 6
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, y - 2, pageWidth - margin, y - 2)
  }

  const para = (text: string, indent = 0) => {
    if (!text || !text.trim()) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.setTextColor(150, 150, 150)
      doc.text('— not yet captured —', margin + indent, y)
      y += 6
      return
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const lines = doc.splitTextToSize(text, maxWidth - indent)
    ensureSpace(lines.length * 5 + 2)
    doc.text(lines, margin + indent, y)
    y += lines.length * 5 + 2
  }

  const bullet = (text: string, suffix?: string) => {
    if (!text.trim()) return
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const line = `• ${text}${suffix ? `  [${suffix}]` : ''}`
    const lines = doc.splitTextToSize(line, maxWidth - 5)
    ensureSpace(lines.length * 5)
    doc.text(lines, margin + 3, y)
    y += lines.length * 5 + 1
  }

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(30, 41, 59)
  doc.text('Mutual Success Plan', margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  doc.text(`Customer: ${customerName}`, margin, y)
  y += 5
  doc.text(`Updated: ${new Date(plan.updatedAt).toLocaleString()}`, margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text('Khalsa LGROLNP framework — co-authored, signature-ready.', margin, y)
  y += 8

  section('Success criteria (customer\'s words)')
  para(plan.successCriteria)
  y += 2

  section('Evidence required')
  if (plan.evidenceRequired.length === 0) para('')
  plan.evidenceRequired.forEach((e) => bullet(e.text, e.verified ? 'verified' : 'unverified'))
  y += 2

  section('Decision makers')
  if (plan.decisionDate) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Target decision date: ${plan.decisionDate}`, margin, y)
    y += 6
  }
  if (plan.decisionMakers.length === 0) para('')
  plan.decisionMakers.forEach((dm) =>
    bullet(`${dm.name || '?'} — ${dm.role || '?'}`, dm.roleInDecision || 'role unspecified'),
  )
  y += 2

  section('What would have to be true?')
  if (plan.whatWouldHaveToBeTrue.length === 0) para('')
  plan.whatWouldHaveToBeTrue.forEach((w) => bullet(w.text, w.status ?? 'unknown'))
  y += 2

  section('Customer commitments')
  if (plan.customerCommitments.length === 0) para('')
  plan.customerCommitments.forEach((c) => bullet(c.text))
  y += 2

  section('Microsoft commitments')
  if (plan.microsoftCommitments.length === 0) para('')
  plan.microsoftCommitments.forEach((c) => bullet(c.text))
  y += 4

  // Sign-off block
  ensureSpace(40)
  section('Sign-off')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)
  doc.text('Customer sponsor:  _______________________________   Date: _______________', margin, y)
  y += 8
  doc.text('Microsoft lead:    _______________________________   Date: _______________', margin, y)

  const slug = customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer'
  doc.save(`ID-8-mutual-success-plan-${slug}.pdf`)
}

// Re-export icon for use in launchers
export { FileText }
