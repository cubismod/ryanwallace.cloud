export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  CACHE = 'CACHE',
  GEOSPATIAL = 'GEOSPATIAL',
  CONNECTION = 'CONNECTION'
}

export class BaseError extends Error {
  public readonly type: ErrorType
  public readonly timestamp: number
  public readonly code?: string

  constructor(type: ErrorType, message: string, code?: string) {
    super(message)
    this.type = type
    this.timestamp = Date.now()
    this.code = code
    this.name = this.constructor.name
  }
}

export class NetworkError extends BaseError {
  public readonly statusCode?: number
  public readonly url?: string

  constructor(
    message: string,
    statusCode?: number,
    url?: string,
    code?: string
  ) {
    super(ErrorType.NETWORK, message, code)
    this.statusCode = statusCode
    this.url = url
  }
}

export class ValidationError extends BaseError {
  public readonly field?: string

  constructor(message: string, field?: string, code?: string) {
    super(ErrorType.VALIDATION, message, code)
    this.field = field
  }
}

export class CacheError extends BaseError {
  public readonly operation?: string

  constructor(message: string, operation?: string, code?: string) {
    super(ErrorType.CACHE, message, code)
    this.operation = operation
  }
}

export class ConnectionError extends BaseError {
  public readonly connectionType?: string

  constructor(message: string, connectionType?: string, code?: string) {
    super(ErrorType.CONNECTION, message, code)
    this.connectionType = connectionType
  }
}

export class GeospatialError extends BaseError {
  public readonly coordinates?: [number, number]

  constructor(message: string, coordinates?: [number, number], code?: string) {
    super(ErrorType.GEOSPATIAL, message, code)
    this.coordinates = coordinates
  }
}

export function isAppError(error: unknown): error is BaseError {
  return error instanceof BaseError
}

export function formatError(error: unknown): string {
  if (isAppError(error)) {
    return `[${error.type}] ${error.message}${error.code ? ` (${error.code})` : ''}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function logError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : ''

  if (isAppError(error)) {
    console.error(`${prefix} ${formatError(error)}`, {
      type: error.type,
      code: error.code,
      timestamp: new Date(error.timestamp).toISOString(),
      ...('statusCode' in error && { statusCode: error.statusCode }),
      ...('url' in error && { url: error.url }),
      ...('field' in error && { field: error.field }),
      ...('operation' in error && { operation: error.operation }),
      ...('connectionType' in error && {
        connectionType: error.connectionType
      }),
      ...('query' in error && { query: error.query }),
      ...('endpoint' in error && { endpoint: error.endpoint }),
      ...('coordinates' in error && { coordinates: error.coordinates })
    })
  } else {
    console.error(`${prefix} ${error}`)
  }
}
