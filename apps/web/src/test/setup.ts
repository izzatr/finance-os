import '@testing-library/jest-dom/vitest'

Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1024 })
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 768 })
