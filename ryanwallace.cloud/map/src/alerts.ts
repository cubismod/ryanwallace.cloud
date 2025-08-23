import { formatDistance } from 'date-fns'
import { AlertData, RouteMapping } from './types'

function embedSVG(line: string, alt: string): string {
  return `<img src="/images/icons/lines/${line}.svg" alt="${alt}" class="line">`
}

// escapeHtml + clamped rendering helpers are defined later in this file.

function calculateAffectedLines(data: Array<{ route: string }>): string {
  const routeMap: Record<string, RouteMapping> = {
    Red: { svg: 'rl', alt: 'Red Line' },
    Blue: { svg: 'bl', alt: 'Blue Line' },
    Greenbush: { svg: 'cr-greenbush', alt: 'Greenbush Line' },
    Green: { svg: 'gl', alt: 'Green Line' },
    Orange: { svg: 'ol', alt: 'Orange Line' },
    749: { svg: 'sl5', alt: 'Silver Line 5' },
    751: { svg: 'sl4', alt: 'Silver Line 4' },
    746: { svg: 'slw', alt: 'Silver Line Way' },
    743: { svg: 'sl3', alt: 'Silver Line 3' },
    741: { svg: 'sl1', alt: 'Silver Line 1 (Airport)' },
    742: { svg: 'sl2', alt: 'Silver Line 2' },
    Fitchburg: { svg: 'cr-fitchburg', alt: 'Fitchburg Line' },
    Fairmont: { svg: 'cr-fairmont', alt: 'Fairmont Line' },
    'CR-Fairmont': { svg: 'cr-fairmont', alt: 'Fairmont Line' },
    Fairmount: { svg: 'cr-fairmont', alt: 'Fairmont Line' },
    'CR-Fairmount': { svg: 'cr-fairmont', alt: 'Fairmont Line' },
    NewBedford: { svg: 'cr-fall-river', alt: 'Fall River/New Bedford Line' },
    Franklin: { svg: 'cr-franklin', alt: 'Franklin/Foxboro Line' },
    Haverhill: { svg: 'cr-haverhill', alt: 'Haverhill Line' },
    Kingston: { svg: 'cr-kingston', alt: 'Kingston Line' },
    Lowell: { svg: 'cr-lowell', alt: 'Lowell Line' },
    Needham: { svg: 'cr-needham', alt: 'Needham Line' },
    Newburyport: { svg: 'cr-newburyport', alt: 'Newburyport/Rockport Line' },
    Providence: { svg: 'cr-providence', alt: 'Providence Line' },
    Worcester: { svg: 'cr-worcester', alt: 'Worcester Line' }
  }

  const afLines = new Set()
  for (const entity of data) {
    for (const routePattern in routeMap) {
      if (
        entity.route === routePattern ||
        entity.route.includes(routePattern)
      ) {
        const { svg, alt } = routeMap[routePattern]
        afLines.add(embedSVG(svg, alt))
        break
      }
    }
  }
  // Render icons inline; layout handled by CSS flex on .alert-lines
  return [...afLines].join('')
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
      const cards: string[] = []

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
          const lines = calculateAffectedLines(alert.attributes.informed_entity)
          const sev = alert.attributes.severity
          const updatedDisplay = formatDistance(
            new Date(
              alert.attributes.updated_at || alert.attributes.created_at
            ),
            new Date(),
            { addSuffix: true }
          )
          const header = alert.attributes.header
          const card = renderAlertCard({
            lines,
            severity: parseInt(sev),
            updatedDisplay,
            text: header
          })
          cards.push(card)
          msgs.add(header)
        }
      }

      const container = document.getElementById('alerts')
      if (!container) {
        console.warn('Alerts container not found')
        return
      }
      if (cards.length === 0) {
        container.innerHTML =
          '<div class="info-links alert-card"><p>No active alerts.</p></div>'
      } else {
        container.innerHTML = cards.join('\n')
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(adjustAlertClampButtons)
        } else {
          setTimeout(adjustAlertClampButtons, 0)
        }
      }
    })
    .catch((e) => {
      console.error('Failed to load alerts:', e)
    })
}

// Global function for toggling alert text (needs to be accessible to onclick)
declare global {
  interface Window {
    toggleAlertText: (button: HTMLButtonElement) => void
  }
}

window.toggleAlertText = function (button: HTMLButtonElement) {
  const container = button.parentElement
  if (!container) return

  const expanded = container.classList.toggle('expanded')
  button.textContent = expanded ? 'Show less' : 'Show more'
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
}

type AlertCardData = {
  lines: string
  severity: number
  updatedDisplay: string
  text: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderAlertTextClamp(text: string): string {
  const safe = escapeHtml(text)
  return `
    <div class="alert-text-container">
      <span class="alert-text">${safe}</span>
      <button class="alert-text-toggle" onclick="toggleAlertText(this)" aria-expanded="false">Show more</button>
    </div>
  `
}

function renderAlertCard({
  lines,
  severity,
  updatedDisplay,
  text
}: AlertCardData): string {
  const sevClass = severityClass(severity)
  const sevLabel = severityLabel(severity)
  return `
    <div class="info-links alert-card">
      <div class="alert-card-meta">
        <div class="alert-lines">${lines}</div>
        <div class="alert-sev ${sevClass}" title="${sevLabel}">${sevLabel}</div>
      </div>
      <div class="alert-card-body">
        ${renderAlertTextClamp(text)}
      </div>
      <div title="Last updated"><small>${updatedDisplay}</small></div>
    </div>
  `
}

function adjustAlertClampButtons(): void {
  const containers = document.querySelectorAll(
    '.alert-text-container'
  ) as NodeListOf<HTMLElement>
  containers.forEach((container) => {
    const textEl = container.querySelector('.alert-text') as HTMLElement | null
    const btn = container.querySelector(
      '.alert-text-toggle'
    ) as HTMLButtonElement | null
    if (!textEl || !btn) return

    const wasExpanded = container.classList.contains('expanded')
    if (wasExpanded) container.classList.remove('expanded')

    // If text doesn't overflow the clamped area, remove the button
    const overflow = textEl.scrollHeight > textEl.clientHeight + 1
    if (!overflow) {
      btn.remove()
    }

    if (wasExpanded) container.classList.add('expanded')
  })
}

function severityClass(n: number): string {
  if (n >= 9) return 'sev-critical'
  if (n >= 7) return 'sev-high'
  if (n >= 4) return 'sev-med'
  return 'sev-low'
}

function severityLabel(n: number): string {
  if (n >= 9) return `Critical (Sev ${n})`
  if (n >= 7) return `High (Sev ${n})`
  if (n >= 4) return `Medium (Sev ${n})`
  return `Low (Sev ${n})`
}
