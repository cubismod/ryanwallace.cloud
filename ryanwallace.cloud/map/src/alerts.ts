import DataTable from 'datatables.net'
import { formatDistance } from 'date-fns'
import { AlertData, RouteMapping } from './types'

function embedSVG(line: string, alt: string): string {
  return `<img src="/images/icons/lines/${line}.svg" alt="${alt}" class="line">`
}

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
  return [...afLines].join('</br>')
}

let alertsTable: any | null = null

export function alerts(vehicles_url: string): void {
  fetch(`${vehicles_url}/alerts`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: AlertData) => {
      const msgs = new Set()
      const dataSet = []

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
          const rowData = [
            calculateAffectedLines(alert.attributes.informed_entity),
            alert.attributes.severity,
            {
              display: formatDistance(
                new Date(
                  alert.attributes.updated_at || alert.attributes.created_at
                ),
                new Date(),
                { addSuffix: true }
              ),
              timestamp: new Date(
                alert.attributes.updated_at || alert.attributes.created_at
              ).getTime()
            },
            alert.attributes.header
          ]
          dataSet.push(rowData)
        }
      }

      // If already initialized, update instead of reinit
      const alertsEl = document.getElementById('alerts')
      const alreadyHasDt = !!alertsEl?.querySelector('.dt-container')
      if (alertsTable || alreadyHasDt) {
        try {
          alertsTable = alertsTable || (DataTable as any).api('#alerts')
          alertsTable.clear()
          alertsTable.rows.add(dataSet)
          alertsTable.draw()
          return
        } catch {}
      }

      alertsTable = new DataTable('#alerts', {
        columns: [
          { title: 'Lines' },
          { title: 'Sev', className: 'dt-body-center' },
          {
            title: 'Upd',
            render: {
              _: 'display',
              sort: 'timestamp'
            }
          },
          { title: 'Alert', className: 'alert-body' }
        ],
        order: [
          [0, 'desc'],
          [1, 'desc']
        ],
        data: dataSet,
        ordering: true,
        paging: false
      })
    })
    .catch((_e) => {
      // Silently ignore for now; alerts are non-critical
    })
}
