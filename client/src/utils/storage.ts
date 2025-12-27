export const storage = {
  get<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  },
  set(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

