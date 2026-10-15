import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DiscoverySettingsDialog } from '@/components/DiscoverySettingsDialog'
import { NavigationHeader } from '@/components/NavigationHeader'
import { lookupTickerSymbol, TickerLookupResult, TickerDiagnostics, TickerLookupResponse } from '@/lib/earnings-service'
import { fetchCompanyFinancials } from '@/lib/economic-context-service'
import { EntityType, ENTITY_TYPE_LABELS, ENTITY_TYPE_DESCRIPTIONS, ComplianceEnforcement, ManualFinancialContext, AccountSegment, ACCOUNT_SEGMENT_META, UserRole, USER_ROLE_LABELS, USER_ROLE_DESCRIPTIONS, USER_ROLE_ICONS } from '@/lib/types'
import { Building, User, UserCircle, MapPin, Wrench, GearSix, ChartLine, MagnifyingGlass, Check, Info, ShieldCheck, CurrencyDollar, Buildings, UsersThree } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export interface SessionMetadata {
  customerName: string
  innovationHubSPOC: string
  primaryStakeholder: string
  accountTeamRep: string
  innovationHubLocation: string
  solutionEngineer: string
  stockTicker?: string // Optional stock ticker for public companies
  entityType?: EntityType // Type of organization
  accountSegment?: AccountSegment // Account segment — enterprise, majors-growth, smec
  complianceEnforcement?: ComplianceEnforcement // Strict or advisory gate mode
  manualFinancials?: ManualFinancialContext // Manual financial data for non-public entities
  userRole?: UserRole // Persona using ID-8 — controls feature visibility
}

interface SessionMetadataFormProps {
  onSubmit: (metadata: SessionMetadata) => void
  onCancel: () => void
  onBackToLanding?: () => void
  initialMetadata?: Partial<SessionMetadata>
}

const INNOVATION_HUB_LOCATIONS = [
  'Amsterdam, Netherlands',
  'Atlanta, USA',
  'Beijing, China',
  'Bengaluru, India',
  'Boston, USA',
  'Cairo, Egypt',
  'Chicago, USA',
  'Copenhagen, Denmark',
  'Dublin, Ireland',
  'Dubai, UAE',
  'Houston, USA',
  'Johannesburg, South Africa',
  'London, UK',
  'Los Angeles, USA',
  'Melbourne, Australia',
  'Mexico City, Mexico',
  'Miami, USA',
  'Milan, Italy',
  'Moscow, Russia',
  'Munich, Germany',
  'New York, USA',
  'Paris, France',
  'Redmond, USA',
  'San Francisco, USA',
  'São Paulo, Brazil',
  'Seattle, USA',
  'Seoul, South Korea',
  'Shanghai, China',
  'Singapore',
  'Stockholm, Sweden',
  'Sydney, Australia',
  'Tokyo, Japan',
  'Toronto, Canada',
  'Vancouver, Canada',
  'Washington DC, USA',
  'Zurich, Switzerland',
]

export function SessionMetadataForm({ onSubmit, onCancel, onBackToLanding, initialMetadata }: SessionMetadataFormProps) {
  const [metadata, setMetadata] = useState<SessionMetadata>({
    customerName: initialMetadata?.customerName || '',
    innovationHubSPOC: initialMetadata?.innovationHubSPOC || '',
    primaryStakeholder: initialMetadata?.primaryStakeholder || '',
    accountTeamRep: initialMetadata?.accountTeamRep || '',
    innovationHubLocation: initialMetadata?.innovationHubLocation || '',
    solutionEngineer: initialMetadata?.solutionEngineer || '',
    stockTicker: initialMetadata?.stockTicker || '',
    entityType: initialMetadata?.entityType || 'public-company',
    accountSegment: initialMetadata?.accountSegment || 'enterprise',
    complianceEnforcement: initialMetadata?.complianceEnforcement || 'advisory',
    manualFinancials: initialMetadata?.manualFinancials || {},
    userRole: initialMetadata?.userRole || 'innovation-hub',
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tickerSuggestions, setTickerSuggestions] = useState<TickerLookupResult[]>([])
  const [tickerDiagnostics, setTickerDiagnostics] = useState<TickerDiagnostics>({})
  const [tickerStatus, setTickerStatus] = useState<TickerLookupResponse['status']>(undefined)
  const [tickerMessage, setTickerMessage] = useState('')
  // Remembers the last customer name we auto-searched so the debounced effect
  // fires once per name instead of looping forever when no ticker is found.
  const autoSearchedNameRef = useRef('')
  const [isSearchingTicker, setIsSearchingTicker] = useState(false)
  const [showTickerSuggestions, setShowTickerSuggestions] = useState(false)
  const [tickerAutoPopulated, setTickerAutoPopulated] = useState(false)
  const [enrichmentSources, setEnrichmentSources] = useState<string[]>([])
  const [isEnriching, setIsEnriching] = useState(false)

  // Auto-search ticker when customer name is filled
  const handleTickerSearch = useCallback(async (opts?: { auto?: boolean }) => {
    const auto = opts?.auto === true
    if (!metadata.customerName.trim() || metadata.customerName.trim().length < 3) {
      if (!auto) toast.error('Please enter a customer name (minimum 3 characters)')
      return
    }

    setIsSearchingTicker(true)
    if (!auto) setShowTickerSuggestions(true)
    setTickerSuggestions([])
    setTickerDiagnostics({})
    setTickerStatus(undefined)
    setTickerMessage('')

    try {
      const { tickers, diagnostics, status, message } = await lookupTickerSymbol(metadata.customerName)
      setTickerSuggestions(tickers)
      setTickerDiagnostics(diagnostics)
      setTickerStatus(status)
      setTickerMessage(message || '')

      if (tickers.length > 0) {
        setShowTickerSuggestions(true)
        if (!auto) toast.success(`Found ${tickers.length} ticker suggestion${tickers.length !== 1 ? 's' : ''}`)
      } else if (!auto) {
        if (status === 'unreachable' || status === 'error') {
          toast.error(message || 'Ticker lookup is unavailable right now. You can enter one manually.')
        } else {
          toast.info('No ticker symbols found. You can enter one manually.')
        }
      }
    } catch (error) {
      console.error('Ticker lookup error:', error)
      setTickerStatus('error')
      setTickerMessage('Failed to search ticker symbols. You can enter one manually.')
      if (!auto) toast.error('Failed to search ticker symbols. You can enter one manually.')
    } finally {
      setIsSearchingTicker(false)
    }
  }, [metadata.customerName])

  // Auto-search ticker when customer name has 3+ characters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        metadata.entityType === 'public-company' &&
        metadata.customerName.trim().length >= 3 && 
        !metadata.stockTicker && 
        !tickerAutoPopulated &&
        !isSearchingTicker &&
        metadata.customerName.trim().toLowerCase() !== autoSearchedNameRef.current
      ) {
        autoSearchedNameRef.current = metadata.customerName.trim().toLowerCase()
        handleTickerSearch({ auto: true })
      }
    }, 1500) // Debounce 1.5 seconds

    return () => clearTimeout(timer)
  }, [metadata.entityType, metadata.customerName, metadata.stockTicker, tickerAutoPopulated, isSearchingTicker, handleTickerSearch])

  const handleSelectTicker = (ticker: TickerLookupResult) => {
    setMetadata((current) => ({
      ...current,
      stockTicker: ticker.ticker,
    }))
    setShowTickerSuggestions(false)
    setTickerAutoPopulated(true)
    toast.success(`Ticker ${ticker.ticker} selected`)
  }

  // Auto-enrich from public financial sources whenever a ticker becomes available
  useEffect(() => {
    const ticker = metadata.stockTicker?.trim()
    if (!ticker || ticker.length < 1 || ticker.length > 8) return
    if (isEnriching) return
    let cancelled = false
    const run = async () => {
      setIsEnriching(true)
      try {
        const region = /\./.test(ticker) ? 'GLOBAL' : 'US'
        const snap = await fetchCompanyFinancials(ticker, region as any)
        if (cancelled) return
        setMetadata((current) => {
          const fin = current.manualFinancials || {}
          const next = { ...fin }
          if (snap.revenueUSD && !fin.annualRevenue) next.annualRevenue = Math.round(snap.revenueUSD)
          if (snap.employees && !fin.employeeCount) next.employeeCount = snap.employees
          if (!fin.financialSource) next.financialSource = 'document-extraction'
          if (snap.industry && !fin.keyFinancialMetrics) {
            next.keyFinancialMetrics = `${snap.industry}${snap.sector ? ' / ' + snap.sector : ''}${snap.country ? ' (' + snap.country + ')' : ''}`
          }
          return { ...current, manualFinancials: next }
        })
        setEnrichmentSources(snap.sources?.map((s) => s.name) || [])
        if ((snap.sources?.length ?? 0) > 0) {
          toast.success(`Auto-enriched from ${snap.sources!.map((s) => s.name).join(', ')}`)
        }
      } catch (err) {
        console.warn('Company financials enrichment failed', err)
      } finally {
        if (!cancelled) setIsEnriching(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata.stockTicker])

  const handleChange = (field: keyof SessionMetadata, value: string) => {
    setMetadata((current) => ({ ...current, [field]: value }))
  }

  // Only the customer name is required to start a discovery session. Every other
  // field is optional metadata that can be completed later — gating "Continue" on
  // all of them made the button look broken when optional fields were left blank.
  const isValid = metadata.customerName.trim().length > 0

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <NavigationHeader
            variant="minimal"
            onBackToLanding={onBackToLanding}
            onBack={onCancel}
            backLabel="Cancel"
          />
        </div>
        <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl bg-card border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Session Information</CardTitle>
                <CardDescription>
                  Provide information about the customer and this discovery session
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2" 
                onClick={() => setSettingsOpen(true)}
              >
                <GearSix size={16} />
                Settings
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ── Role / Persona Selector ──────────────────────────── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck size={18} />
                Your Role
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['innovation-hub', 'ats', 'csa', 'sales'] as UserRole[]).map((role) => {
                  const selected = metadata.userRole === role
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setMetadata((c) => ({ ...c, userRole: role }))}
                      className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{USER_ROLE_ICONS[role]}</span>
                        <span className="font-semibold text-xs">{USER_ROLE_LABELS[role]}</span>
                        {selected && <Check size={12} className="text-primary ml-auto" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{USER_ROLE_DESCRIPTIONS[role]}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* ── Account Segment Selector ──────────────────────────── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <UsersThree size={18} />
                Account Segment
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['enterprise', 'majors-growth', 'smec'] as AccountSegment[]).map((seg) => {
                  const meta = ACCOUNT_SEGMENT_META[seg]
                  const selected = metadata.accountSegment === seg
                  return (
                    <button
                      key={seg}
                      type="button"
                      onClick={() => {
                        setMetadata((current) => ({
                          ...current,
                          accountSegment: seg,
                          entityType: meta.defaultEntityType,
                          stockTicker: meta.defaultEntityType === 'public-company' ? current.stockTicker : '',
                        }))
                        setTickerAutoPopulated(false)
                      }}
                      className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 bg-card'
                      }`}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2">
                          <Check size={16} className="text-primary" />
                        </div>
                      )}
                      <p className="font-semibold text-sm">{meta.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 pr-5">{meta.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>Deal: {meta.typicalDealSize}</span>
                        <span>·</span>
                        <span>{meta.discoveryDuration}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name" className="flex items-center gap-2">
                  <Building size={16} />
                  Customer Name
                  <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="customer-name"
                  placeholder="Enter customer name"
                  value={metadata.customerName}
                  onChange={(e) => handleChange('customerName', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="innovation-hub-spoc" className="flex items-center gap-2">
                  <UserCircle size={16} />
                  Innovation Hub SPOC
                </Label>
                <Input
                  id="innovation-hub-spoc"
                  placeholder="Enter Hub SPOC name"
                  value={metadata.innovationHubSPOC}
                  onChange={(e) => handleChange('innovationHubSPOC', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primary-stakeholder" className="flex items-center gap-2">
                  <UserCircle size={16} />
                  Primary Stakeholder
                </Label>
                <Input
                  id="primary-stakeholder"
                  placeholder="Enter primary stakeholder name"
                  value={metadata.primaryStakeholder}
                  onChange={(e) => handleChange('primaryStakeholder', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-team-rep" className="flex items-center gap-2">
                  <User size={16} />
                  Account Team Representative
                </Label>
                <Input
                  id="account-team-rep"
                  placeholder="Enter account team rep name"
                  value={metadata.accountTeamRep}
                  onChange={(e) => handleChange('accountTeamRep', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="innovation-hub-location" className="flex items-center gap-2">
                  <MapPin size={16} />
                  Innovation Hub Location
                </Label>
                <Select
                  value={metadata.innovationHubLocation}
                  onValueChange={(value) => handleChange('innovationHubLocation', value)}
                >
                  <SelectTrigger id="innovation-hub-location">
                    <SelectValue placeholder="Select hub location" />
                  </SelectTrigger>
                  <SelectContent>
                    {INNOVATION_HUB_LOCATIONS.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="solution-engineer" className="flex items-center gap-2">
                  <Wrench size={16} />
                  Innovation Hub Solution Engineer
                </Label>
                <Input
                  id="solution-engineer"
                  placeholder="Enter solution engineer name"
                  value={metadata.solutionEngineer}
                  onChange={(e) => handleChange('solutionEngineer', e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="entity-type" className="flex items-center gap-2">
                  <Buildings size={16} />
                  Organization Type
                </Label>
                <Select
                  value={metadata.entityType || 'public-company'}
                  onValueChange={(value) => {
                    const entityType = value as EntityType
                    setMetadata((current) => ({
                      ...current,
                      entityType,
                      // Clear ticker when switching away from public company
                      stockTicker: entityType === 'public-company' ? current.stockTicker : '',
                    }))
                    setTickerAutoPopulated(false)
                  }}
                >
                  <SelectTrigger id="entity-type">
                    <SelectValue placeholder="Select organization type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex flex-col">
                          <span>{ENTITY_TYPE_LABELS[type]}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ENTITY_TYPE_DESCRIPTIONS[metadata.entityType || 'public-company']}
                </p>
              </div>

              {metadata.entityType === 'public-company' && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="stock-ticker" className="flex items-center gap-2">
                  <ChartLine size={16} />
                  Stock Ticker (Optional)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="stock-ticker"
                    placeholder="e.g., MSFT, NPN.JO, SOL.JO"
                    value={metadata.stockTicker || ''}
                    onChange={(e) => {
                      handleChange('stockTicker', e.target.value.toUpperCase())
                      setTickerAutoPopulated(false)
                    }}
                    className="uppercase flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleTickerSearch()}
                    disabled={isSearchingTicker || !metadata.customerName.trim()}
                    className="gap-2"
                  >
                    <MagnifyingGlass size={16} />
                    {isSearchingTicker ? 'Searching...' : 'Search'}
                  </Button>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    For public companies - enables AI analysis of earnings calls and financial data. 
                    Click Search to auto-discover ticker symbols or enter manually.
                  </span>
                </div>

                <AnimatePresence>
                  {showTickerSuggestions && tickerSuggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border rounded-lg p-3 bg-muted/30 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Suggested Tickers:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowTickerSuggestions(false)}
                          className="h-6 px-2 text-xs"
                        >
                          Close
                        </Button>
                      </div>
                      <Separator />
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {tickerSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.ticker}
                            type="button"
                            onMouseDown={() => handleSelectTicker(suggestion)}
                            className="w-full text-left p-2 rounded hover:bg-accent transition-colors flex items-center justify-between group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-sm">
                                  {suggestion.ticker}
                                </span>
                                {typeof suggestion.score === 'number' && (
                                  <Badge variant="outline" className="text-xs">
                                    {(suggestion.score * 100).toFixed(0)}%
                                  </Badge>
                                )}
                                <Badge 
                                  variant={
                                    suggestion.confidence === 'high' 
                                      ? 'default' 
                                      : suggestion.confidence === 'medium'
                                      ? 'secondary'
                                      : 'outline'
                                  }
                                  className="text-xs"
                                >
                                  {suggestion.confidence}
                                </Badge>
                                {suggestion.source === 'ai-guess' && (
                                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400">
                                    AI guess — verify
                                  </Badge>
                                )}
                                {suggestion.region && (
                                  <Badge variant="outline" className="text-xs">
                                    {suggestion.region}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {suggestion.name}
                                {suggestion.exchange && ` • ${suggestion.exchange}`}
                              </p>
                            </div>
                            <Check size={16} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        Sources: curated &middot; OpenFIGI &middot; Wikidata &middot; TradingView &middot; Yahoo &middot; SEC EDGAR &middot; Stooq &middot; Alpha Vantage
                      </p>
                      {Object.keys(tickerDiagnostics).length > 0 && (
                        <p className="text-[10px] text-muted-foreground/80 font-mono break-all">
                          {Object.entries(tickerDiagnostics)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(' · ')}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {showTickerSuggestions && !isSearchingTicker && tickerSuggestions.length === 0 && tickerStatus && tickerStatus !== 'ok' && (
                  <div
                    className={`flex items-start gap-2 text-xs rounded-lg border p-2.5 ${
                      tickerStatus === 'empty'
                        ? 'text-muted-foreground bg-muted/30'
                        : 'text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/5'
                    }`}
                  >
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                      {tickerStatus === 'empty'
                        ? 'No ticker symbols matched this name. Enter it manually if you know it.'
                        : tickerMessage || 'Ticker lookup is unavailable right now. Enter the ticker manually.'}
                    </span>
                  </div>
                )}
              </div>
              )}

              {/* Manual Financial Context — for non-public entities or supplementary data */}
              {metadata.entityType && metadata.entityType !== 'public-company' && (
              <div className="space-y-4 md:col-span-2 border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CurrencyDollar size={16} />
                  Financial Context (Optional)
                  {isEnriching && (
                    <Badge variant="outline" className="text-[10px]">Enriching…</Badge>
                  )}
                  {!isEnriching && enrichmentSources.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]" title={enrichmentSources.join(', ')}>
                      AI inferred · {enrichmentSources.length} source{enrichmentSources.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {metadata.entityType === 'government' 
                    ? 'Provide annual budget and headcount to improve cost-of-inaction and ROI estimates.'
                    : 'Provide financial metrics to improve cost-of-inaction and ROI estimates.'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="annual-revenue" className="text-xs">
                      {metadata.entityType === 'government' ? 'Annual Budget (USD)' : 'Annual Revenue (USD)'}
                    </Label>
                    <Input
                      id="annual-revenue"
                      type="number"
                      placeholder={metadata.entityType === 'government' ? 'e.g., 50000000' : 'e.g., 100000000'}
                      value={metadata.manualFinancials?.annualRevenue || ''}
                      onChange={(e) => setMetadata((current) => ({
                        ...current,
                        manualFinancials: {
                          ...current.manualFinancials,
                          annualRevenue: e.target.value ? Number(e.target.value) : undefined,
                          financialSource: 'manual',
                        },
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employee-count" className="text-xs">
                      Number of Employees
                    </Label>
                    <Input
                      id="employee-count"
                      type="number"
                      placeholder="e.g., 5000"
                      value={metadata.manualFinancials?.employeeCount || ''}
                      onChange={(e) => setMetadata((current) => ({
                        ...current,
                        manualFinancials: {
                          ...current.manualFinancials,
                          employeeCount: e.target.value ? Number(e.target.value) : undefined,
                          financialSource: 'manual',
                        },
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="it-budget" className="text-xs">
                      IT Budget (USD, optional)
                    </Label>
                    <Input
                      id="it-budget"
                      type="number"
                      placeholder="e.g., 5000000"
                      value={metadata.manualFinancials?.itBudget || ''}
                      onChange={(e) => setMetadata((current) => ({
                        ...current,
                        manualFinancials: {
                          ...current.manualFinancials,
                          itBudget: e.target.value ? Number(e.target.value) : undefined,
                          financialSource: 'manual',
                        },
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="financial-notes" className="text-xs">
                      Key Financial Context
                    </Label>
                    <Input
                      id="financial-notes"
                      placeholder="e.g., 15% YoY growth, R&D heavy"
                      value={metadata.manualFinancials?.keyFinancialMetrics || ''}
                      onChange={(e) => setMetadata((current) => ({
                        ...current,
                        manualFinancials: {
                          ...current.manualFinancials,
                          keyFinancialMetrics: e.target.value || undefined,
                          financialSource: 'manual',
                        },
                      }))}
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Compliance Enforcement Mode */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="compliance-enforcement" className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  Compliance Gate Mode
                </Label>
                <Select
                  value={metadata.complianceEnforcement || 'advisory'}
                  onValueChange={(value) => handleChange('complianceEnforcement', value)}
                >
                  <SelectTrigger id="compliance-enforcement" className="w-full min-w-0">
                    <SelectValue placeholder="Select compliance mode" className="min-w-0 flex-1 truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advisory">
                      Advisory — Show warnings, never block
                    </SelectItem>
                    <SelectItem value="strict">
                      Strict — Block high/unacceptable risk until remediation
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {metadata.complianceEnforcement === 'strict'
                      ? 'Use cases classified as high or unacceptable risk will require sign-off before saving. Unacceptable risk use cases are blocked until remediation is acknowledged.'
                      : 'Risk assessments are shown as warnings. All use cases can proceed regardless of risk level.'
                    }
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-4">
              {!isValid && (
                <p className="text-xs text-muted-foreground text-right">
                  Enter a customer name to continue.
                </p>
              )}
              <div className="flex gap-4 justify-end">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button onClick={() => onSubmit(metadata)} disabled={!isValid}>
                  Continue to Discovery
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
      
      <DiscoverySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
