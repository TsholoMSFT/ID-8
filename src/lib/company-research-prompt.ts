export interface ResearchFeedItem {
  title: string
  description: string
  link: string
  pubDate: string
}

export function researchItemsToText(items: ResearchFeedItem[], maxItems = 10): string {
  return items.slice(0, maxItems)
    .map(item => `HEADLINE: ${item.title}\nDATE: ${item.pubDate}\nSUMMARY: ${item.description}\n`)
    .join('\n---\n')
}

export function buildCompanyInsightPrompt(content: string, companyName: string, sourceTitle: string, entityGuidance = ''): string {
  const trimmed = content.trim()
  const clipped = trimmed.length <= 12000
    ? trimmed
    : `${trimmed.slice(0, 8400)}\n\n[...truncated...]\n\n${trimmed.slice(-3600)}`

  return `You are a business analyst preparing for an AI discovery session with ${companyName}.${entityGuidance}

CONTENT TO ANALYZE:
"""
${clipped}
"""

SOURCE: ${sourceTitle}

TASK: Extract key business insights that could inform AI/technology opportunities.

For each insight, identify:
1. Category (strategy, financial, technology, market, operations, culture, news)
2. A concise title (5-10 words)
3. A brief summary (2-3 sentences)
4. How this relates to AI/automation opportunities
5. 1-3 potential use cases this insight suggests
6. Confidence level in the insight (high/medium/low)

Return a JSON object:
{
  "insights": [
    {
      "category": "strategy|financial|technology|market|operations|culture|news",
      "title": "Brief insight title",
      "summary": "2-3 sentence summary",
      "relevanceToAI": "How this relates to AI opportunities",
      "potentialUseCases": ["Use case 1", "Use case 2"],
      "confidence": "high|medium|low"
    }
  ]
}

Extraction rules:
- Extract 3-8 insights when there is sufficient signal (e.g., multiple headlines, clear themes, initiatives, risks).
- Do NOT return an empty insights list unless the content genuinely contains no business-relevant information.
- If the content is mostly headlines, infer themes and summarize them as "news" or "strategy" insights.

Return valid JSON only.`
}
