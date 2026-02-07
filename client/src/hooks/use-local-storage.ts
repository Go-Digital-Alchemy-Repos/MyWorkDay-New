import { useState, useCallback } from "react";

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      try {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch {
        console.warn(`Failed to save to localStorage key "${key}"`);
      }
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue];
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  sortValue: string;
  viewMode: "grid" | "table";
  density: "comfortable" | "compact";
}

export function useSavedViews(storageKey: string) {
  const [views, setViews] = useLocalStorage<SavedView[]>(storageKey, []);

  const saveView = useCallback((view: Omit<SavedView, "id">) => {
    const newView: SavedView = {
      ...view,
      id: `view-${Date.now()}`,
    };
    setViews((prev) => [...prev, newView]);
    return newView;
  }, [setViews]);

  const deleteView = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, [setViews]);

  return { views, saveView, deleteView };
}
