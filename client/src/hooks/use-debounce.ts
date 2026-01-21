/**
 * Debounce Hook
 * 
 * Delays updating a value until after the specified delay has passed
 * since the last change. Useful for reducing API calls during rapid input.
 * 
 * @example
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 200);
 * // debouncedSearch only updates 200ms after user stops typing
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (e.g., 200 for command palette search)
 * @returns The debounced value
 */
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
