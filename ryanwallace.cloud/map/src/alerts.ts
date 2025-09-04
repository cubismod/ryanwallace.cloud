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

  // Ensure a search input exists even if the template didn't include one
  const alertsEl = document.getElementById('alerts')
  if (alertsEl && !document.getElementById('alerts-search')) {
    const search = document.createElement('input')
    search.type = 'search'
    search.id = 'alerts-search'
    search.className = 'alerts-search-input'
    search.placeholder = 'Search alerts (route, text, severity)'
    search.setAttribute('aria-label', 'Search alerts')
    // Insert before alerts grid
    alertsEl.parentElement?.insertBefore(search, alertsEl)
  }

  // Insert skeleton placeholders while loading
  const skeletonContainer = document.getElementById('alerts')
  if (skeletonContainer) {
    skeletonContainer.classList.add('alerts-grid')
    skeletonContainer.setAttribute('aria-busy', 'true')
    skeletonContainer.innerHTML = ''
    const skCount = 6
    for (let i = 0; i < skCount; i++) {
      const card = document.createElement('div')
      card.className = 'alert-card alert-skeleton-card'
      card.setAttribute('aria-hidden', 'true')

      const head = document.createElement('div')
      head.className = 'alert-card-head'
      const lines = document.createElement('div')
      lines.className = 'alert-lines'
      for (let j = 0; j < 3; j++) {
        const icon = document.createElement('div')
        icon.className = 'skeleton icon'
        lines.appendChild(icon)
      }
      const meta = document.createElement('div')
      meta.className = 'alert-meta'
      const sev = document.createElement('div')
      sev.className = 'skeleton pill'
      meta.appendChild(sev)
      head.appendChild(lines)
      head.appendChild(meta)

      const imgWrap = document.createElement('div')
      imgWrap.className = 'alert-image'
      const imgPh = document.createElement('div')
      imgPh.className = 'skeleton img'
      imgWrap.appendChild(imgPh)

      const body = document.createElement('div')
      body.className = 'alert-card-body'
      const l1 = document.createElement('div')
      l1.className = 'skeleton line'
      const l2 = document.createElement('div')
      l2.className = 'skeleton line short'
      body.appendChild(l1)
      body.appendChild(l2)

      const footer = document.createElement('div')
      footer.className = 'alert-card-footer'
      const timePh = document.createElement('div')
      timePh.className = 'skeleton line xshort'
      footer.appendChild(timePh)

      card.appendChild(head)
      card.appendChild(imgWrap)
      card.appendChild(body)
      card.appendChild(footer)
      skeletonContainer.appendChild(card)
    }
  }
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
        image?: string
        searchBlob: string
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
          const linesHtml = calculateAffectedLines(
            alert.attributes.informed_entity
          )
          const plainLines = linesHtml
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          rows.push({
            linesHtml,
            severity: alert.attributes.severity,
            displayTime: formatDistance(new Date(ts), new Date(), {
              addSuffix: true
            }),
            timestamp: ts,
            text: alert.attributes.header,
            url: alert.attributes.url,
            image: alert.attributes.image,
            searchBlob:
              `${plainLines} sev${alert.attributes.severity} ${alert.attributes.header}`.toLowerCase()
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

      const renderRows = (list: Row[]) => {
        const container = document.getElementById('alerts')
        if (!container) return
        container.innerHTML = ''
        container.classList.add('alerts-grid')
        container.removeAttribute('aria-busy')

        for (const r of list) {
          const card = document.createElement('div')
          card.className = 'alert-card'

          const head = document.createElement('div')
          head.className = 'alert-card-head'
          const lines = document.createElement('div')
          lines.className = 'alert-lines'
          lines.innerHTML = r.linesHtml
          // Determine route classes present for glow color(s)
          const present = new Set<string>()
          lines.querySelectorAll('.route-badge').forEach((el) => {
            const c = Array.from(el.classList).find((k) =>
              ['rl', 'gl', 'bl', 'ol', 'sl', 'cr'].includes(k)
            )
            if (c) present.add(c)
          })
          const routeRgb: Record<string, string> = {
            rl: '250,45,39',
            gl: '0,129,80',
            bl: '47,93,166',
            ol: '253,138,3',
            sl: '154,156,157',
            cr: '123,56,140'
          }
          if (present.size === 1) {
            const only = Array.from(present)[0]
            card.classList.add(`alert-glow-${only}`)
          } else if (present.size > 1) {
            const dark = document.body.classList.contains('dark-theme')
            const alpha = dark ? 0.12 : 0.08
            const glows: string[] = []
            present.forEach((k) => {
              const rgb = routeRgb[k]
              if (rgb) {
                glows.push(`0 0 10px rgba(${rgb}, ${alpha})`)
              }
            })
            if (glows.length) {
              card.classList.add('alert-glow-custom')
              card.style.setProperty('--alert-glow', glows.join(', '))
            }
          }
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

          // Optional image (if provided)
          if (r.image && /^https?:\/\//i.test(r.image)) {
            const imgWrap = document.createElement('div')
            imgWrap.className = 'alert-image'

            const link = document.createElement('a')
            // Prefer linking to the alert URL; otherwise link to the image
            link.href = r.url && /^https?:\/\//i.test(r.url) ? r.url : r.image
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
            link.title = 'Open alert'
            link.setAttribute('aria-label', 'Open alert')

            const img = document.createElement('img')
            img.src = r.image
            img.alt = 'Alert image'
            ;(img as any).loading = 'lazy'
            ;(img as any).decoding = 'async'
            img.addEventListener('error', () => {
              imgWrap.remove()
            })

            link.appendChild(img)
            imgWrap.appendChild(link)
            body.appendChild(imgWrap)
          }

          const textEl = document.createElement('div')
          textEl.textContent = r.text
          body.appendChild(textEl)

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
      }

      // Initial render + wire search
      const searchInput = document.getElementById(
        'alerts-search'
      ) as HTMLInputElement | null
      const run = () => {
        if (!searchInput || !searchInput.value.trim()) {
          renderRows(rows)
          return
        }
        const words = searchInput.value.toLowerCase().trim().split(/\s+/)
        const filtered = rows.filter((r) =>
          words.every((w) => r.searchBlob.includes(w))
        )
        renderRows(filtered)
      }
      if (searchInput) {
        let t: number | undefined
        searchInput.addEventListener('input', () => {
          if (t) window.clearTimeout(t)
          t = window.setTimeout(run, 120)
        })
      }
      run()
    })
    .catch((e) => {
      console.error('Failed to load alerts:', e)
      const container = document.getElementById('alerts')
      if (container) {
        container.innerHTML =
          '<div class="alert-error">Failed to load alerts.</div>'
        container.classList.add('alerts-grid')
        container.removeAttribute('aria-busy')
      }
    })
}

function severityClass(sev: number | string): string {
  const s = typeof sev === 'number' ? sev : parseInt(String(sev) || '0', 10)
  if (s >= 8) return 'high'
  if (s >= 5) return 'med'
  return 'low'
}
