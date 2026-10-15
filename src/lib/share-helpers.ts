/**
 * Share helpers
 * ----------------------------------------------------------------------------
 * Tiny utilities for opening Teams chat / Outlook compose with a pre-filled
 * subject + body, and for copying rich HTML to the clipboard so it pastes
 * cleanly into Word / Outlook with formatting preserved.
 *
 * All functions are best-effort — they try the native share, then fall back
 * to mailto: / a fresh tab.
 */

/** Encode for `?param=` style query strings. */
function enc(s: string): string {
  return encodeURIComponent(s ?? '')
}

/**
 * Open Teams "share to chat" deep link. If recipients are supplied, opens
 * a chat with them; otherwise opens the share-to-Teams picker.
 */
export function openTeamsShare(opts: {
  message: string
  recipients?: string[] // UPNs / emails
  topic?: string
}): void {
  const { message, recipients, topic } = opts
  if (recipients?.length) {
    const url =
      `https://teams.microsoft.com/l/chat/0/0` +
      `?users=${enc(recipients.join(','))}` +
      (topic ? `&topicName=${enc(topic)}` : '') +
      `&message=${enc(message)}`
    window.open(url, '_blank', 'noopener')
    return
  }
  // share-to-teams (composer)
  const shareUrl = `https://teams.microsoft.com/share?msgText=${enc(message)}${topic ? `&href=${enc(topic)}` : ''}`
  window.open(shareUrl, '_blank', 'noopener')
}

/** Open Outlook web compose. Prefers OWA deep link, falls back to mailto. */
export function openOutlookCompose(opts: {
  to?: string[]
  cc?: string[]
  subject: string
  body: string
  isHtml?: boolean
}): void {
  const { to = [], cc = [], subject, body, isHtml } = opts

  // OWA deep link supports HTML bodies via "body" param when opened in browser.
  const owa =
    `https://outlook.office.com/mail/deeplink/compose` +
    `?to=${enc(to.join(';'))}` +
    (cc.length ? `&cc=${enc(cc.join(';'))}` : '') +
    `&subject=${enc(subject)}` +
    `&body=${enc(body)}`

  // Try OWA first (most enterprise users have it); if the popup is blocked
  // we still leave the user with mailto: as a manual fallback.
  const win = window.open(owa, '_blank', 'noopener')
  if (!win) {
    const mailto =
      `mailto:${enc(to.join(','))}` +
      `?subject=${enc(subject)}` +
      `&body=${enc(isHtml ? stripHtml(body) : body)}` +
      (cc.length ? `&cc=${enc(cc.join(','))}` : '')
    window.location.href = mailto
  }
}

/**
 * Copy rich HTML to clipboard (paste into Word / Outlook keeps formatting).
 * Falls back to plain-text copy when the rich-clipboard API isn't available.
 */
export async function copyRichHtmlToClipboard(html: string): Promise<boolean> {
  try {
    if ('ClipboardItem' in window && navigator.clipboard?.write) {
      const blobHtml = new Blob([html], { type: 'text/html' })
      const blobText = new Blob([stripHtml(html)], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText }),
      ])
      return true
    }
  } catch {
    /* swallow — fall through to plain text */
  }
  try {
    await navigator.clipboard.writeText(stripHtml(html))
    return true
  } catch {
    return false
  }
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

/** Build a short Teams-friendly markdown summary of a discovery session. */
export function buildTeamsSummary(input: {
  customerName: string
  topUseCases?: Array<{ title: string; annualCoiUSD?: number }>
  threeYearBenefitUSD?: number
  paybackMonths?: number
}): string {
  const lines: string[] = []
  lines.push(`**ID-8 Discovery — ${input.customerName}**`)
  lines.push('')
  if (input.topUseCases?.length) {
    lines.push('Top use cases:')
    input.topUseCases.slice(0, 5).forEach((uc, i) => {
      const coi = uc.annualCoiUSD ? ` — $${(uc.annualCoiUSD / 1000).toFixed(0)}K annual COI` : ''
      lines.push(`${i + 1}. ${uc.title}${coi}`)
    })
    lines.push('')
  }
  if (input.threeYearBenefitUSD) {
    lines.push(`3-year benefit: $${(input.threeYearBenefitUSD / 1e6).toFixed(1)}M`)
  }
  if (input.paybackMonths) {
    lines.push(`Payback: ${input.paybackMonths.toFixed(1)} months`)
  }
  lines.push('')
  lines.push('Full readout attached / available on request.')
  return lines.join('\n')
}
