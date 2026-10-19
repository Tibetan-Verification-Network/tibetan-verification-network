import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

import "../styles.css";
import { resetApiState } from "../api/client";
import { forgetInviteToken } from "../auth/inviteMemory";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  const api: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && store.has(prop)) {
        return store.get(prop);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    ownKeys() {
      return [...store.keys()];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "string" && store.has(prop)) {
        return { configurable: true, enumerable: true, value: store.get(prop) };
      }
      return undefined;
    },
  });
}

function installStorage(target: object, key: "localStorage" | "sessionStorage", value: Storage) {
  Object.defineProperty(target, key, { configurable: true, value });
}

const local = memoryStorage();
const session = memoryStorage();
installStorage(window, "localStorage", local);
installStorage(globalThis, "localStorage", local);
installStorage(window, "sessionStorage", session);
installStorage(globalThis, "sessionStorage", session);

function installWideViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

function installEnglishNavigator() {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    get: () => "en-US",
  });
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    get: () => ["en-US"],
  });
}

installWideViewport();
installEnglishNavigator();

afterEach(() => {
  cleanup();
  resetApiState();
  forgetInviteToken();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = "en";
  document.title = "";
  installWideViewport();
  installEnglishNavigator();
});
