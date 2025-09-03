import { formatDistance } from 'date-fns'
import { AlertData } from './types'

function calculateAffectedLines(data: Array<{ route: string }>): string {
  const routeMap: Record<string, { label: string; cls: string }> = {
    Red: { label: 'Red Line', cls: 'rl' },
    Blue: { label: 'Blue Line', cls: 'bl' },
    Green: { label: 'Green Line', cls: 'gl' },
    Orange: { label: 'Orange Line', cls: 'ol' },
    749: { label: 'Silver Line 5', cls: 'sl' },
    751: { label: 'Silver Line 4', cls: 'sl' },
    746: { label: 'Silver Line Way', cls: 'sl' },
    743: { label: 'Silver Line 3', cls: 'sl' },
    741: { label: 'Silver Line 1', cls: 'sl' },
    742: { label: 'Silver Line 2', cls: 'sl' },
    Fitchburg: { label: 'Fitchburg Line', cls: 'cr' },
    Fairmont: { label: 'Fairmount Line', cls: 'cr' },
    'CR-Fairmont': { label: 'Fairmount Line', cls: 'cr' },
    Fairmount: { label: 'Fairmount Line', cls: 'cr' },
    'CR-Fairmount': { label: 'Fairmount Line', cls: 'cr' },
    NewBedford: { label: 'Fall River/New Bedford Line', cls: 'cr' },
    Franklin: { label: 'Franklin/Foxboro Line', cls: 'cr' },
    Haverhill: { label: 'Haverhill Line', cls: 'cr' },
    Kingston: { label: 'Kingston Line', cls: 'cr' },
    Lowell: { label: 'Lowell Line', cls: 'cr' },
    Needham: { label: 'Needham Line', cls: 'cr' },
    Newburyport: { label: 'Newburyport/Rockport Line', cls: 'cr' },
    Providence: { label: 'Providence Line', cls: 'cr' },
    Worcester: { label: 'Worcester Line', cls: 'cr' },
    Greenbush: { label: 'Greenbush Line', cls: 'cr' }
  }

  const labels = new Map<string, string>()
  for (const entity of data) {
    for (const routePattern in routeMap) {
      if (
        entity.route === routePattern ||
        entity.route.includes(routePattern)
      ) {
        const { label, cls } = routeMap[routePattern]
        labels.set(label, cls)
        break
      }
    }
  }
  if (labels.size === 0) return ''
  return Array.from(labels.entries())
    .map(([label, cls]) => `<span class="route-badge ${cls}">${label}</span>`)
    .join(' ')
}

export function alerts(vehicles_url: string): void {
  console.log('Fetching alerts from:', `${vehicles_url}/alerts`)
  fetch(`${vehicles_url}/alerts`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: AlertData) => {
      console.log('Alerts data received:', data)
      const msgs = new Set<string>()
      type Row = {
        linesHtml: string
        severity: number | string
        displayTime: string
        timestamp: number
        text: string
        url?: string
      }
      const rows: Row[] = []

      for (const alert of data.data) {
        if (alert.attributes && !msgs.has(alert.attributes.header)) {
          if (
            alert.attributes.active_period.length > 0 &&
            alert.attributes.active_period[0].end
          ) {
            const end_time = alert.attributes.active_period[0].end
            if (Date.parse(end_time) < Date.now()) {
              continue
            }
          }
          const ts = new Date(
            alert.attributes.updated_at || alert.attributes.created_at
          ).getTime()
          rows.push({
            linesHtml: calculateAffectedLines(alert.attributes.informed_entity),
            severity: alert.attributes.severity,
            displayTime: formatDistance(new Date(ts), new Date(), {
              addSuffix: true
            }),
            timestamp: ts,
            text: alert.attributes.header,
            url: alert.attributes.url
          })
        }
      }

      // Sort: severity desc, then most recent first
      rows.sort((a, b) => {
        const sevA = typeof a.severity === 'number' ? a.severity : 0
        const sevB = typeof b.severity === 'number' ? b.severity : 0
        if (sevB !== sevA) return sevB - sevA
        return b.timestamp - a.timestamp
      })

      const container = document.getElementById('alerts')
      if (!container) return
      container.innerHTML = ''
      container.classList.add('alerts-grid')

      for (const r of rows) {
        const card = document.createElement('div')
        card.className = 'alert-card'

        const head = document.createElement('div')
        head.className = 'alert-card-head'
        const lines = document.createElement('div')
        lines.className = 'alert-lines'
        lines.innerHTML = r.linesHtml
        const meta = document.createElement('div')
        meta.className = 'alert-meta'
        const sev = document.createElement('span')
        sev.className = `sev sev-${severityClass(r.severity)}`
        sev.textContent = `Sev ${r.severity}`
        meta.appendChild(sev)
        head.appendChild(lines)
        head.appendChild(meta)

        const body = document.createElement('div')
        body.className = 'alert-card-body'
        body.textContent = r.text

        // Optional link icon in header
        if (r.url && /^https?:\/\//i.test(r.url)) {
          const link = document.createElement('a')
          link.className = 'alert-head-link'
          link.href = r.url
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.textContent = '🔗'
          link.title = 'Open full alert'
          link.setAttribute('aria-label', 'Open full alert')
          meta.appendChild(link)
        }

        card.appendChild(head)
        card.appendChild(body)

        // Footer with timestamp moved to bottom
        const footer = document.createElement('div')
        footer.className = 'alert-card-footer'
        const timeEl = document.createElement('span')
        timeEl.className = 'time'
        timeEl.textContent = r.displayTime
        footer.appendChild(timeEl)
        card.appendChild(footer)
        container.appendChild(card)
      }
    })
    .catch((e) => {
      console.error('Failed to load alerts:', e)
    })
}

function severityClass(sev: number | string): string {
  const s = typeof sev === 'number' ? sev : parseInt(String(sev) || '0', 10)
  if (s >= 8) return 'high'
  if (s >= 5) return 'med'
  return 'low'
}
