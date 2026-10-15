# ID-8 - Microsoft Innovation Hub Use Case Assessment Tool

**Live application:** [Open ID-8](https://red-field-069bdce0f.5.azurestaticapps.net/)

**Author:** Tsholo K. Setati  
**Project:** ID-8 (Microsoft Innovation Hub Enterprise Discovery)

I built this comprehensive web application to help evaluate and prioritize use cases using Impact vs. Feasibility analysis and RICE scoring methodology. The tool is powered by AI to streamline the discovery process and make customer engagements more efficient.

## 🚀 Quick Start

### Prerequisites
- Node.js 20 or 22 and npm
- Azure Functions Core Tools v4 and Azurite, or a deployed API endpoint
- Azure OpenAI API key **or** an Entra identity with Cognitive Services OpenAI User

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/TsholoMSFT/ID-8.git
cd ID-8
```

2. **Install dependencies**
```powershell
# PowerShell (Windows) - use cmd /c prefix
cmd /c "npm install"

# Also install API dependencies
cmd /c "cd api && npm install"
```

3. **Configure AI authentication**

For key mode, edit the ignored `api/local.settings.json`:
```json
{
  "Values": {
    "AZURE_OPENAI_AUTH_TYPE": "key",
    "AZURE_OPENAI_ENDPOINT": "https://your-resource.openai.azure.com/",
    "AZURE_OPENAI_API_KEY": "your-key-here"
  }
}
```

For Entra mode, set `AZURE_OPENAI_AUTH_TYPE` to `entra-id`, omit the key, run `az login`, and assign Cognitive Services OpenAI User to the local/deployed identity.

4. **Start the local API and frontend**
```powershell
.\scripts\start-local-api.ps1
npm run dev
```

5. **Open your browser**
Navigate to `http://localhost:3000`

### Common Commands

| Command | Purpose |
|---------|---------|
| `cmd /c "npm run dev"` | Start development server |
| `cmd /c "npm run build"` | Build for production |
| `cmd /c "npm run preview"` | Preview production build |
| `cmd /c "cd api && npm install"` | Install API dependencies |
| `cmd /c "git add -A && git commit -m message && git push"` | Commit and push |

## 🤖 AI-Powered Features

The application uses task-routed models through a server-side Azure Functions proxy. Production currently uses GPT-5.4-mini for analysis and executive content, with separately configured inexpensive extraction/formatting deployments. Model aliases are not prices; provider usage is recorded against the actual deployment.

- **🎯 Real-Time Discovery Insights**: AI analyzes voice responses during Live Discovery and suggests opportunities
- **💡 Smart Question Assistance**: Get thoughtful prompts and examples for discovery questions
- **🚀 Automatic Use Case Generation**: AI generates 5-8 relevant use cases from your discovery session
- **📄 Executive Summaries**: Professional AI-generated summaries ready for leadership presentations

**See [AI-GUIDE.md](./docs/guides/AI-GUIDE.md) for configuration, cost controls, and knowledge retrieval, or [AI-FEATURES.md](./docs/guides/AI-FEATURES.md) for feature documentation.**

## Key Features

### Discovery Process
- **Guided Discovery Workflow**: Answer strategic questions about business goals, challenges, and technical context
- **Dual Input Modes**: 
  - Standard Mode (text input with AI suggestions)
  - Live Mode (voice input with real-time AI insights)
- **Seamless Mode Switching**: Switch between text and voice mid-session without losing progress
- **Industry-Specific Questions**: Tailored questions for Healthcare, Financial Services, Manufacturing, and more

### Use Case Assessment
- **Impact vs. Feasibility Scoring**: Quick visual prioritization on a 2x2 matrix
- **RICE Methodology**: Comprehensive scoring using Reach, Impact, Confidence, and Effort
- **Dual Scoring Views**: Switch between methodologies to compare different prioritization approaches
- **Top Recommendations**: Automatically identifies top 3-5 use cases based on selected scoring method

### Session Management
- **Multi-Customer Support**: Manage assessments for multiple customers
- **Session Comparison**: Compare discovery sessions side-by-side
- **Customer Metadata**: Track stakeholders, locations, and team members
- **Persistent Storage**: All data saved locally in your browser

### Export & Reporting
- **PDF Export**: Generate professional assessment reports with customer branding
- **Print-Friendly Views**: Optimized layouts for sharing and presentations
- **Executive Summaries**: AI-generated strategic overviews of discovery findings
- **Comprehensive Reports**: Include methodology explanations, scores, and recommendations

## Getting Started

Here's how I designed the workflow:

1. **Start a Discovery Session**: Click "Start Discovery" from the landing page
2. **Enter Customer Information**: Provide customer name, location, and stakeholders
3. **Choose Discovery Mode**:
   - Standard Mode for typed responses (with AI help available)
   - Live Mode for voice-based sessions (with AI insights)
4. **Answer Questions**: Respond to guided questions about the customer's needs
5. **Review AI-Generated Use Cases**: The AI analyzes responses and suggests relevant use cases
6. **Score Use Cases**: Evaluate each use case using Impact/Feasibility and RICE scoring
7. **View Results**: AI generates an executive summary and displays prioritized recommendations
8. **Export & Share**: Generate PDF reports for stakeholder presentations

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **UI Components**: shadcn/ui v4, Radix UI primitives
- **State Management**: React hooks with localStorage for persistence
- **AI Integration**: Task-routed models via a server-side managed Functions API
- **Knowledge retrieval**: Private Blob-backed BM25/vector hybrid search; no dedicated Azure AI Search service
- **Speech Recognition**: Web Speech API (Chrome, Edge, Safari)
- **Icons**: Phosphor Icons
- **Animations**: Framer Motion
- **Build Tool**: Vite 7

## Documentation

- **[PRD.md](./PRD.md)**: Complete product requirements and design specifications
- **[AI-GUIDE.md](./AI-GUIDE.md)**: Quick start guide for AI features
- **[AI-FEATURES.md](./AI-FEATURES.md)**: Comprehensive AI technical documentation

## Browser Compatibility

- **Recommended**: Chrome, Edge (best support for Live Discovery voice features)
- **Supported**: Safari, Firefox (Standard Discovery fully supported)
- **Note**: Live Discovery requires Web Speech API support

## Privacy & Data

- All data stored locally in your browser using localStorage
- AI features process only the information you explicitly provide via OpenAI API
- Microsoft Entra sign-in is required for consultant and AI features; customer questionnaire links remain public and token-scoped
- Private Azure Table Storage holds questionnaires and durable per-user/application quotas
- Session data persists between browser sessions
- **Your OpenAI API key is stored in environment variables and never exposed to the browser**

## Development

### Available Scripts

```bash
npm run dev          # Start development server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Project Structure

```
src/
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   └── ...          # Feature components
├── hooks/           # Custom React hooks
├── lib/             # Utilities, types, and services
│   ├── openai-service.ts    # OpenAI API integration
│   └── types.ts             # TypeScript type definitions
└── styles/          # Global styles and themes
```

## Deployment

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready to deploy to any static hosting service:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Azure Static Web Apps

**Production deployment** uses the `id8-app` Free Static Web App and its managed API. The canonical GitHub workflow deploys the frontend and `api` together. The separate Flex Functions/azd deployment path has been retired.

```powershell
npm run typecheck
npm test
npm --prefix api test
npm --prefix api run build
npm run build
# With Azure Static Web Apps CLI available; use the existing site's token via
# SWA_CLI_DEPLOYMENT_TOKEN, never a literal token in a command or source file.
swa deploy id8 --api-language node --api-version 22 --env production
```

The [managed infrastructure template](./infra/main.bicep) describes only the Free site and references existing storage. After `az login`, `npm --prefix api run configure:managed` merges cost-control settings into `id8-app` without displaying keys, and `npm --prefix api run knowledge:verify` checks the private knowledge index and quota/cache boundaries. For a new corpus, use `knowledge:seed` (it refuses to replace an index without `--replace`).

The ID-8 technical migration is complete: 56 knowledge documents and the existing quota counters were verified, the renamed feed workflows succeeded, and the previous site/workflows were retired with owner approval. The previous URL no longer works. Server data, backups and monitoring history were retained. Ordinary releases deploy only to `id8-app`; the one-time migration commands are not part of normal deployment.

**Never place service keys in `VITE_*` variables.** Managed Functions do not support managed identity or Key Vault references; server-side model and storage keys must remain in the Static Web App's encrypted API settings. See [AI-GUIDE.md](./docs/guides/AI-GUIDE.md).

## 👤 Author

**Tsholo K. Setati**  
Microsoft Innovation Hub

---

📄 **License**

MIT License - Copyright (c) 2026 Tsholo K. Setati
