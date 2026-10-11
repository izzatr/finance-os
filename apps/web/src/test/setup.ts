import '@testing-library/jest-dom/vitest'

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1024 })
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 768 })

// Node 22+ ships its own experimental `localStorage` global, which can shadow jsdom's and be
// undefined when tests run under load. Install a plain in-memory Storage so every test file
// gets a working, isolated localStorage/sessionStorage regardless of the Node version.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  removeItem(key: string) { this.map.delete(key) }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: new MemoryStorage() })
  if (typeof window !== 'undefined') Object.defineProperty(window, name, { configurable: true, writable: true, value: globalThis[name] })
}
