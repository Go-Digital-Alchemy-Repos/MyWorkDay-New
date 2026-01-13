import { useCallback, useMemo } from "react"
import { useLocation, useSearch } from "wouter"

export type PanelType = 
  | "task-create"
  | "task-edit"
  | "client-create"
  | "client-edit"
  | "time-entry-create"
  | "time-entry-edit"
  | "project-create"
  | "project-edit"
  | "user-create"
  | "user-edit"

interface PanelState {
  panel: PanelType | null
  id: string | null
}

interface UsePanelStateReturn {
  panelState: PanelState
  openPanel: (panel: PanelType, id?: string) => void
  closePanel: () => void
  isPanelOpen: (panel: PanelType, id?: string) => boolean
}

export function usePanelState(): UsePanelStateReturn {
  const [location, setLocation] = useLocation()
  const searchString = useSearch()

  const panelState = useMemo<PanelState>(() => {
    const params = new URLSearchParams(searchString)
    const panel = params.get("panel") as PanelType | null
    const id = params.get("id")
    return { panel, id }
  }, [searchString])

  const openPanel = useCallback((panel: PanelType, id?: string) => {
    const params = new URLSearchParams(searchString)
    params.set("panel", panel)
    if (id) {
      params.set("id", id)
    } else {
      params.delete("id")
    }
    const newSearch = params.toString()
    const basePath = location.split("?")[0]
    setLocation(`${basePath}?${newSearch}`, { replace: false })
  }, [location, searchString, setLocation])

  const closePanel = useCallback(() => {
    const params = new URLSearchParams(searchString)
    params.delete("panel")
    params.delete("id")
    const newSearch = params.toString()
    const basePath = location.split("?")[0]
    if (newSearch) {
      setLocation(`${basePath}?${newSearch}`, { replace: false })
    } else {
      setLocation(basePath, { replace: false })
    }
  }, [location, searchString, setLocation])

  const isPanelOpen = useCallback((panel: PanelType, id?: string) => {
    if (panelState.panel !== panel) return false
    if (id !== undefined && panelState.id !== id) return false
    return true
  }, [panelState])

  return {
    panelState,
    openPanel,
    closePanel,
    isPanelOpen,
  }
}
