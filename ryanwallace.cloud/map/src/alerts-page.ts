import { alerts } from './alerts'

const vehicles_url: string =
  import.meta.env.VEHICLES_URL || 'https://imt.ryanwallace.cloud'

function init(): void {
  const table = document.getElementById('alerts')
  if (!table) return
  alerts(vehicles_url)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
