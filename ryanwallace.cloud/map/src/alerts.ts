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
  // Ensure a sort select exists even if the template didn't include one
  if (alertsEl && !document.getElementById('alerts-sort')) {
    const select = document.createElement('select')
    select.id = 'alerts-sort'
    select.className = 'alerts-sort-select'
    select.setAttribute('aria-label', 'Sort alerts')
    select.innerHTML = `
      <option value="relevant" selected>Most relevant (pinned recent, severity, newest)</option>
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="sev-desc">Severity high → low</option>
      <option value="sev-asc">Severity low → high</option>
      <option value="route-az">Route A → Z</option>
    `
    alertsEl.parentElement?.insertBefore(select, alertsEl)
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

      // Base sort (will be refined by user selection later)
      rows.sort((a, b) => {
        const sevA =
          typeof a.severity === 'number'
            ? a.severity
            : parseInt(String(a.severity) || '0', 10)
        const sevB =
          typeof b.severity === 'number'
            ? b.severity
            : parseInt(String(b.severity) || '0', 10)
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

      // Initial render + wire search and sort, with pinning recent (<=15 min)
      const searchInput = document.getElementById(
        'alerts-search'
      ) as HTMLInputElement | null
      const sortSelect = document.getElementById(
        'alerts-sort'
      ) as HTMLSelectElement | null
      const sortRows = (arr: Row[], mode: string): Row[] => {
        const cmpNum = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)
        const getSev = (r: Row) =>
          typeof r.severity === 'number'
            ? r.severity
            : parseInt(String(r.severity) || '0', 10)
        const getLines = (r: Row) =>
          r.linesHtml
            .replace(/<[^>]*>/g, ' ')
            .trim()
            .toLowerCase()
        const copy = arr.slice()
        switch (mode) {
          case 'newest':
            return copy.sort((a, b) => cmpNum(b.timestamp, a.timestamp))
          case 'oldest':
            return copy.sort((a, b) => cmpNum(a.timestamp, b.timestamp))
          case 'sev-desc':
            return copy.sort(
              (a, b) =>
                cmpNum(getSev(b), getSev(a)) || cmpNum(b.timestamp, a.timestamp)
            )
          case 'sev-asc':
            return copy.sort(
              (a, b) =>
                cmpNum(getSev(a), getSev(b)) || cmpNum(b.timestamp, a.timestamp)
            )
          case 'route-az':
            return copy.sort(
              (a, b) =>
                getLines(a).localeCompare(getLines(b)) ||
                cmpNum(b.timestamp, a.timestamp)
            )
          case 'relevant':
          default:
            return copy.sort(
              (a, b) =>
                cmpNum(getSev(b), getSev(a)) || cmpNum(b.timestamp, a.timestamp)
            )
        }
      }
      const run = () => {
        const q = searchInput?.value.toLowerCase().trim() || ''
        const words = q ? q.split(/\s+/) : []
        const filtered = !words.length
          ? rows
          : rows.filter((r) => words.every((w) => r.searchBlob.includes(w)))
        const mode = sortSelect?.value || 'relevant'
        const now = Date.now()
        const pinWindowMs = 25 * 60 * 1000
        const pinned = filtered.filter((r) => now - r.timestamp <= pinWindowMs)
        const others = filtered.filter((r) => now - r.timestamp > pinWindowMs)
        const pinnedSorted = pinned.sort((a, b) => b.timestamp - a.timestamp)
        const othersSorted = sortRows(others, mode)
        renderRows([...pinnedSorted, ...othersSorted])
      }
      let debounce: number | undefined
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          if (debounce) window.clearTimeout(debounce)
          debounce = window.setTimeout(run, 120)
        })
      }
      if (sortSelect) {
        sortSelect.addEventListener('change', run)
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
