import { spawnSync } from 'node:child_process'

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 }
const minimumSeverity = 'high'

// Temporary exception for an upstream advisory that currently has no safe release:
// npm recommends 7.11.0, but that release is affected by several older high-severity
// advisories. Keep the latest release and fail closed after the expiry date.
const allowedAdvisories = new Map([
  [
    'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
    { expires: '2026-08-15', reason: 'No patched React Router release is available' },
  ],
])

const audit = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
})

if (!audit.stdout) {
  process.stderr.write(audit.stderr || 'npm audit returned no JSON output\n')
  process.exit(1)
}

let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  process.stderr.write('Could not parse npm audit JSON output\n')
  process.exit(1)
}

const vulnerabilities = report.vulnerabilities ?? {}
const today = new Date().toISOString().slice(0, 10)

function advisoryUrls(name, seen = new Set()) {
  if (seen.has(name)) return []
  seen.add(name)

  const vulnerability = vulnerabilities[name]
  if (!vulnerability) return []

  return vulnerability.via.flatMap((entry) => {
    if (typeof entry === 'string') return advisoryUrls(entry, seen)
    return entry.url ? [entry.url] : []
  })
}

const blocked = []
const allowed = []

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if ((severityRank[vulnerability.severity] ?? 0) < severityRank[minimumSeverity]) continue

  const urls = [...new Set(advisoryUrls(name))]
  const exceptions = urls.map((url) => ({ url, exception: allowedAdvisories.get(url) }))
  const fullyAllowed =
    exceptions.length > 0 &&
    exceptions.every(({ exception }) => exception && today <= exception.expires)

  if (fullyAllowed) {
    allowed.push({ name, severity: vulnerability.severity, exceptions })
  } else {
    blocked.push({ name, severity: vulnerability.severity, urls })
  }
}

if (allowed.length > 0) {
  console.warn('Temporarily allowed audit findings:')
  for (const finding of allowed) {
    for (const { url, exception } of finding.exceptions) {
      console.warn(`- ${finding.name}: ${url} (expires ${exception.expires}; ${exception.reason})`)
    }
  }
}

if (blocked.length > 0) {
  console.error(`Blocking npm audit findings (${minimumSeverity} or higher):`)
  for (const finding of blocked) {
    console.error(`- ${finding.name} (${finding.severity}): ${finding.urls.join(', ') || 'no advisory URL'}`)
  }
  process.exit(1)
}

console.log(`npm audit gate passed: no unapproved ${minimumSeverity} or critical findings`)
