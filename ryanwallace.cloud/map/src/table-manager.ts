import DOMPurify from 'dompurify'
import {
  lines,
  vehicleTypes,
  calculateTotal,
  fetchVehicleCounts,
  getCount
} from './vehicle-counter'

export async function updateTable(): Promise<void> {
  try {
    // Fetch latest counts from API before updating table
    await fetchVehicleCounts()
  } catch (error) {
    console.error('Failed to fetch vehicle counts for table update:', error)
    // Continue with empty counts if API fails
  }

  for (const line of lines) {
    for (const vehicleType of vehicleTypes) {
      const id = `${line}-${vehicleType}`
      const element = document.getElementById(id)
      if (element) {
        element.innerHTML = String(
          DOMPurify.sanitize(String(getCount(line, vehicleType)))
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

// Initialize table on load
export function initializeTable(): void {
  // Trigger initial table update
  updateTable().catch((error) => {
    console.error('Failed to initialize table:', error)
  })
}
