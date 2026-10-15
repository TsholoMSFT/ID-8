# ID-8 - Security Policy

**Author:** Tsholo K. Setati  
**Project:** ID-8 (Microsoft Innovation Hub Enterprise Discovery)

## Security Considerations

I designed ID-8 with the following security principles in mind:

### Data Privacy
- All data is stored locally in your browser using localStorage
- No external databases or user authentication required
- Session data persists only in your browser
- AI features process only the information you explicitly provide

### API Key Security
- OpenAI API keys are stored in environment variables
- Keys are never exposed to the browser directly
- All AI requests are made through secure HTTPS connections

### Browser Security
- Live Discovery requires HTTPS or localhost for microphone access
- Web Speech API follows browser permission models
- No third-party tracking or analytics

## Reporting Security Issues

If you believe you have found a security vulnerability in ID-8, please report it responsibly.

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please contact me directly via Microsoft Teams or email.

Please include as much of the information listed below as you can to help me understand and resolve the issue:

  * The type of issue (e.g., XSS, API key exposure, data leak)
  * Full paths of source file(s) related to the issue
  * Steps to reproduce the issue
  * Impact of the issue

## Security Best Practices

When deploying ID-8:

1. **Keep API keys secure** - Never commit `.env` files to source control
2. **Use HTTPS** - Always deploy behind HTTPS in production
3. **Restrict API access** - Use Azure OpenAI endpoint restrictions when available
4. **Regular updates** - Keep dependencies updated to patch vulnerabilities
