declare module 'datatables.net' {
  interface DataTableSettings {
    data?: any[]
    columns?: any[]
    order?: any[]
    pageLength?: number
    searching?: boolean
    autoWidth?: boolean
    ordering?: boolean
    info?: boolean
    lengthChange?: boolean
  }

  interface DataTableRowsApi {
    add: (data: any[]) => DataTableRowsApi
    clear: () => DataTableRowsApi
  }

  interface DataTableApi {
    clear(): DataTableApi
    rows: DataTableRowsApi
    draw(paging?: boolean): DataTableApi
  }

  class DataTable implements DataTableApi {
    constructor(selector: string, options?: DataTableSettings)
    clear(): DataTableApi
    rows: DataTableRowsApi
    draw(paging?: boolean): DataTableApi
  }

  export default DataTable
}

// Vite environment variable types
interface ImportMetaEnv {
  readonly MODE: string
  readonly MT_KEY: string
  readonly VEHICLES_URL: string
  readonly MBTA_API_BASE: string
  readonly TRACK_PREDICTION_API: string
  readonly BOS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
