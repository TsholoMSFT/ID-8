import { UseCase, ScoringMethod, CustomerMetadata } from './types'
import { calculateRICEScore, getQuadrant } from './scoring'
import { getKPIById } from './kpis'
import writeXlsxFile from 'write-excel-file'

type ExcelCell = {
  value: string | number | boolean | Date | undefined
  type?: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | 'Formula'
  fontWeight?: 'bold'
}

function cell(value: string | number | boolean | Date | null | undefined, type?: ExcelCell['type'], extra?: Omit<ExcelCell, 'value' | 'type'>): ExcelCell {
  const v = value ?? undefined
  if (extra) return { value: v, type, ...extra }
  return { value: v, type }
}

function header(value: string): ExcelCell {
  return { value, type: String, fontWeight: 'bold' }
}

export function formatEffort(personWeeks: number, unit: 'person-weeks' | 'fte' | 'man-hours'): string {
  switch (unit) {
    case 'fte':
      return `${(personWeeks / 52).toFixed(3)} FTE`
    case 'man-hours':
      return `${(personWeeks * 40).toFixed(0)} hours`
    default:
      return `${personWeeks} weeks`
  }
}

export function exportToCSV(
  useCases: UseCase[],
  scoringMethod: ScoringMethod,
  effortUnit: 'person-weeks' | 'fte' | 'man-hours',
  customerMetadata?: CustomerMetadata
) {
  const headers: string[] = []
  const rows: string[][] = []

  if (scoringMethod === 'rice') {
    headers.push('Rank', 'Title', 'Description', 'KPIs', 'Reach', 'Impact (multiplier)', 'Confidence (%)', `Effort (${effortUnit})`, 'RICE Score')
    
    useCases.forEach((useCase, index) => {
      const kpiNames = (useCase.kpis || [])
        .map(kpiId => getKPIById(kpiId)?.name)
        .filter(Boolean)
        .join('; ')
      
      rows.push([
        (index + 1).toString(),
        useCase.title,
        useCase.description || '',
        kpiNames,
        useCase.rice.reach.toLocaleString(),
        `${useCase.rice.impact}x`,
        `${useCase.rice.confidence}%`,
        formatEffort(useCase.rice.effort, effortUnit),
        calculateRICEScore(useCase).toFixed(2)
      ])
    })
  } else {
    headers.push('Rank', 'Title', 'Description', 'KPIs', 'Impact (1-10)', 'Feasibility (1-10)', 'Quadrant', 'Composite Score')
    
    useCases.forEach((useCase, index) => {
      const kpiNames = (useCase.kpis || [])
        .map(kpiId => getKPIById(kpiId)?.name)
        .filter(Boolean)
        .join('; ')
      
      rows.push([
        (index + 1).toString(),
        useCase.title,
        useCase.description || '',
        kpiNames,
        useCase.impact.toString(),
        useCase.feasibility.toString(),
        getQuadrant(useCase.impact, useCase.feasibility),
        (useCase.impact * useCase.feasibility).toFixed(2)
      ])
    })
  }

  const csvContent = [
    customerMetadata?.customerName ? [`Customer: ${customerMetadata.customerName}`] : [],
    customerMetadata?.innovationHubLocation ? [`Innovation Hub: ${customerMetadata.innovationHubLocation}`] : [],
    [''],
    headers,
    ...rows
  ]
    .filter(row => row.length > 0)
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `ID-8-use-case-assessment-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportToExcel(
  useCases: UseCase[],
  scoringMethod: ScoringMethod,
  effortUnit: 'person-weeks' | 'fte' | 'man-hours',
  customerMetadata?: CustomerMetadata
) {
  const fileName = `ID-8-use-case-assessment-${new Date().toISOString().split('T')[0]}.xlsx`

  // Sheet 1: Summary
  const summaryRows: ExcelCell[][] = []
  if (customerMetadata) {
    summaryRows.push([cell('Customer Information', String, { fontWeight: 'bold' })])
    summaryRows.push([cell('', String)])
    summaryRows.push([cell('Customer Name:', String), cell(customerMetadata.customerName || '', String)])
    summaryRows.push([cell('Primary Stakeholder:', String), cell(customerMetadata.primaryStakeholder || '', String)])
    summaryRows.push([cell('Account Team Rep:', String), cell(customerMetadata.accountTeamRep || '', String)])
    summaryRows.push([cell('Innovation Hub Location:', String), cell(customerMetadata.innovationHubLocation || '', String)])
    summaryRows.push([cell('Solution Engineer:', String), cell(customerMetadata.solutionEngineer || '', String)])
    if (customerMetadata.executiveSummary) {
      summaryRows.push([cell('Executive Summary:', String), cell(customerMetadata.executiveSummary, String)])
    }
    summaryRows.push([cell('', String)])
  }
  summaryRows.push([cell('Assessment Summary', String, { fontWeight: 'bold' })])
  summaryRows.push([cell('', String)])
  summaryRows.push([cell('Scoring Method:', String), cell(scoringMethod === 'rice' ? 'RICE Framework' : scoringMethod === 'blended' ? 'Balanced (Strategic + Risk-Adjusted)' : scoringMethod === 'financial-impact' ? 'Financial Impact' : 'Impact/Feasibility Matrix', String)])
  summaryRows.push([cell('Total Use Cases:', String), cell(useCases.length, Number)])
  summaryRows.push([cell('Export Date:', String), cell(new Date().toISOString().split('T')[0], String)])
  summaryRows.push([cell('Effort Unit:', String), cell(effortUnit, String)])

  // Sheet 2: Use Cases
  const useCaseRows: ExcelCell[][] = []
  if (scoringMethod === 'rice') {
    useCaseRows.push([
      header('Rank'),
      header('Title'),
      header('Description'),
      header('KPIs'),
      header('Reach'),
      header('Impact (multiplier)'),
      header('Confidence (%)'),
      header(`Effort (${effortUnit})`),
      header('RICE Score'),
    ])

    useCases.forEach((useCase, index) => {
      const kpiNames = (useCase.kpis || [])
        .map(kpiId => getKPIById(kpiId)?.name)
        .filter(Boolean)
        .join('; ')

      const score = calculateRICEScore(useCase)
      useCaseRows.push([
        cell(index + 1, Number),
        cell(useCase.title, String),
        cell(useCase.description || '', String),
        cell(kpiNames, String),
        cell(useCase.rice.reach, Number),
        cell(useCase.rice.impact, Number),
        cell(useCase.rice.confidence, Number),
        cell(formatEffort(useCase.rice.effort, effortUnit), String),
        cell(parseFloat(score.toFixed(2)), Number),
      ])
    })
  } else {
    useCaseRows.push([
      header('Rank'),
      header('Title'),
      header('Description'),
      header('KPIs'),
      header('Impact (1-10)'),
      header('Feasibility (1-10)'),
      header('Quadrant'),
      header('Composite Score'),
    ])

    useCases.forEach((useCase, index) => {
      const kpiNames = (useCase.kpis || [])
        .map(kpiId => getKPIById(kpiId)?.name)
        .filter(Boolean)
        .join('; ')

      const score = useCase.impact * useCase.feasibility
      useCaseRows.push([
        cell(index + 1, Number),
        cell(useCase.title, String),
        cell(useCase.description || '', String),
        cell(kpiNames, String),
        cell(useCase.impact, Number),
        cell(useCase.feasibility, Number),
        cell(getQuadrant(useCase.impact, useCase.feasibility), String),
        cell(parseFloat(score.toFixed(2)), Number),
      ])
    })
  }

  const summaryColumns = [{ width: 28 }, { width: 70 }]
  const useCasesColumns = scoringMethod === 'rice'
    ? [{ width: 6 }, { width: 26 }, { width: 50 }, { width: 30 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 12 }]
    : [{ width: 6 }, { width: 26 }, { width: 50 }, { width: 30 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 14 }]

  void writeXlsxFile([summaryRows, useCaseRows], {
    fileName,
    sheets: ['Summary', 'Use Cases'],
    columns: [summaryColumns, useCasesColumns],
  })
}
export function exportToJSON(
  useCases: UseCase[],
  scoringMethod: ScoringMethod,
  effortUnit: 'person-weeks' | 'fte' | 'man-hours',
  customerMetadata?: CustomerMetadata
) {
  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      scoringMethod,
      effortUnit,
      totalUseCases: useCases.length,
      customer: customerMetadata
    },
    useCases: useCases.map((useCase, index) => ({
      rank: index + 1,
      id: useCase.id,
      title: useCase.title,
      description: useCase.description,
      kpis: (useCase.kpis || []).map(kpiId => {
        const kpi = getKPIById(kpiId)
        return kpi ? { id: kpi.id, name: kpi.name, category: kpi.category } : null
      }).filter(Boolean),
      scoring: scoringMethod === 'rice' 
        ? {
            method: 'RICE',
            reach: useCase.rice.reach,
            impact: useCase.rice.impact,
            confidence: useCase.rice.confidence,
            effort: useCase.rice.effort,
            effortFormatted: formatEffort(useCase.rice.effort, effortUnit),
            score: parseFloat(calculateRICEScore(useCase).toFixed(2))
          }
        : {
            method: 'Impact/Feasibility',
            impact: useCase.impact,
            feasibility: useCase.feasibility,
            quadrant: getQuadrant(useCase.impact, useCase.feasibility),
            score: parseFloat((useCase.impact * useCase.feasibility).toFixed(2))
          },
      createdAt: new Date(useCase.createdAt).toISOString()
    }))
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `ID-8-use-case-assessment-${new Date().toISOString().split('T')[0]}.json`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}