// Global test setup: extends Vitest's `expect` with jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) for component tests.
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom has no layout observer; responsive geometry is checked in the browser.
globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
}

// PDF extraction is browser-only and is not exercised by the current unit
// suites. Mock the transitive import so Node does not require DOMMatrix/canvas
// merely to test company-data formatting helpers.
vi.mock('pdfjs-dist', () => ({
	version: 'test',
	GlobalWorkerOptions: { workerSrc: '' },
	getDocument: vi.fn(),
}))
