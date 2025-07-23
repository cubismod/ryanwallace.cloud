import DOMPurify from 'dompurify'
import {
  lines,
  vehicleTypes,
  vehicleCountMap,
  calculateTotal
} from './vehicle-counter'

export function updateTable(): void {
  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      const id = `${line}-${vehicleType}`
      const element = document.getElementById(id)
      if (element) {
        element.innerHTML = String(
          DOMPurify.sanitize(
            String(vehicleCountMap.get(line)?.get(vehicleType) || 0)
          )
        )
      }
    }
    const totalElement = document.getElementById(`${line}-total`)
    if (totalElement) {
      totalElement.innerHTML = String(
        DOMPurify.sanitize(String(calculateTotal(line)))
      )
    }
  }
  for (const vehicleType of vehicleTypes) {
    const element = document.getElementById(`${vehicleType}-total`)
    if (element) {
      element.innerHTML = String(
        DOMPurify.sanitize(String(calculateTotal(vehicleType)))
      )
    }
  }
  const element = document.getElementById('total')
  if (element) {
    element.innerHTML = String(
      DOMPurify.sanitize(String(calculateTotal('all')))
    )
  }
}
