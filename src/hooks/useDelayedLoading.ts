import { useState, useEffect, useRef } from 'react';

/**
 * Hook that provides a delayed loading state to prevent UI flickering
 * for quick operations.
 * 
 * @param isLoading The actual loading state
 * @param delayMs The delay in milliseconds before showing loading state (default: 800ms)
 * @returns A boolean indicating the delayed loading state
 */
export function useDelayedLoading(isLoading: boolean, delayMs = 800): boolean {
  const [delayedLoading, setDelayedLoading] = useState(isLoading);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isLoading) {
      // Set timer to show loading state after delay
      timerRef.current = window.setTimeout(() => {
        setDelayedLoading(true);
      }, delayMs);
    } else {
      // Immediately hide loading state when operation completes
      setDelayedLoading(false);
    }

    // Cleanup function
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, delayMs]);

  return delayedLoading;
}