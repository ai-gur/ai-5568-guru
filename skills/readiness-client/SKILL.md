---
name: ai-guru-is-5568-accessibility-auditor
description: Use the AI Guru - IS-5568-Accessibility service to submit an authorized website accessibility audit, retrieve an IS 5568 report, and apply remediation guidance. Use when a user asks to audit a deployed website, verify a remediation, or obtain an Israeli accessibility report.
license: Proprietary
---

# AI Guru - IS-5568-Accessibility: Auditor

Use the AI Guru - IS-5568-Accessibility service to audit a website the user is authorized to test. It does not establish legal compliance. Automated findings identify defects; unverified criteria still require human review.

## Configure

Set the product URL and a personal API token outside source control:

```bash
export AI_GURU_IS_5568_ACCESSIBILITY_URL="https://auditor.example.com"
export AI_GURU_IS_5568_ACCESSIBILITY_TOKEN="..."
```

## Submit an audit

Before submitting, confirm that the user controls the target or has written permission to scan it. Never audit localhost, private IPs, staging environments without authorization, or third-party services.

```bash
curl -X POST "$AI_GURU_IS_5568_ACCESSIBILITY_URL/api/v1/audits" \
  -H "Authorization: Bearer $AI_GURU_IS_5568_ACCESSIBILITY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.co.il","maxPages":50}'
```

Save the returned audit ID. Poll `GET /api/v1/audits/<id>` until status is `completed` or `failed`.

## Use the report

1. Read failed rows and their exact selector or document location.
2. Apply the remediation instructions using native HTML controls and semantic structure.
3. Do not invent image alternatives when the image cannot be inspected.
4. Re-run the audit after deployment.
5. Report both fixed items and checks that still require human testing, including screen-reader, captions and visual contrast review.

## Install

For Codex, Claude Code and compatible clients:

```bash
npx skills add ai-gur/ai-guru-is-5568-accessibility --skill ai-guru-is-5568-accessibility-auditor
```

The repository must be published before this command is available.
