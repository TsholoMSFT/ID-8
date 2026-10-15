import { useState, useEffect, useCallback, useRef } from 'react'

type SetValue<T> = T | ((prevValue: T) => T)
const LOCAL_STORAGE_CHANGE_EVENT = 'id8:local-storage-change'

interface LocalStorageChangeDetail<T> {
  key: string
  value: T
}

/**
 * Custom hook for persistent localStorage state
 * Provides a React hook API for storing data in browser localStorage
 * Supports functional updates like React's useState
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: SetValue<T>) => void] {
  // Get stored value or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Keep a ref to the current value for functional updates
  const currentValueRef = useRef(storedValue)
  currentValueRef.current = storedValue

  // Update localStorage when value changes
  const setValue = useCallback(
    (value: SetValue<T>) => {
      try {
        // Support functional updates
        const newValue = value instanceof Function ? value(currentValueRef.current) : value
        currentValueRef.current = newValue
        setStoredValue(newValue)
        window.localStorage.setItem(key, JSON.stringify(newValue))
        window.dispatchEvent(new CustomEvent<LocalStorageChangeDetail<T>>(
          LOCAL_STORAGE_CHANGE_EVENT,
          { detail: { key, value: newValue } }
        ))
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error)
      }
    },
    [key]
  )

  // Listen for changes in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          const newValue = JSON.parse(e.newValue)
          currentValueRef.current = newValue
          setStoredValue(newValue)
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error)
        }
      }
    }

    const handleLocalStorageChange = (event: Event) => {
      const { detail } = event as CustomEvent<LocalStorageChangeDetail<T>>
      if (detail.key !== key) return
      currentValueRef.current = detail.value
      setStoredValue(detail.value)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalStorageChange)
    }
  }, [key])

  return [storedValue, setValue]
}
