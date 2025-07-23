export function setCookie(
  name: string,
  value: string,
  days: number = 365
): void {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}

export function getCookie(name: string): string | null {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

export function niceStatus(status: string): string {
  if (status === 'INCOMING_AT') {
    return 'Arriving'
  }
  if (status === 'IN_TRANSIT_TO') {
    return 'In Transit'
  }
  if (status === 'STOPPED_AT') {
    return 'Stopped'
  }
  return status
}

export function return_colors(route: string): string {
  if (route.startsWith('Green')) {
    return '#008150'
  }
  if (route.startsWith('Blue')) {
    return '#2F5DA6'
  }
  if (route.startsWith('CR')) {
    return '#7B388C'
  }
  if (route.startsWith('Red') || route.startsWith('Mattapan')) {
    return '#FA2D27'
  }
  if (route.startsWith('Orange')) {
    return '#FD8A03'
  }
  if (
    route.startsWith('74') ||
    route.startsWith('75') ||
    route.startsWith('SL')
  ) {
    return '#9A9C9D'
  }
  return '#3e2426'
}
