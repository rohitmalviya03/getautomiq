import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia — the theme store reads it at module
// load time to pick a light/dark default.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom's crypto.randomUUID isn't always present depending on the Node/jsdom
// combination — the toast store relies on it.
if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', {
    value: {
      ...window.crypto,
      randomUUID: () => Math.random().toString(36).slice(2),
    },
  });
}
