"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import CryptoJS from "crypto-js";

const AppContext = createContext(null);
export let AppExport = {};

// -----------------------
// Sync encrypt/decrypt (DataService expects sync)
// -----------------------
function EncryptData(data, sessionKey) {
  if (!sessionKey) throw new Error("EncryptData: sessionKey is required");

  // Keep your old tamper check behaviour: prefix key then payload
  const plaintext = sessionKey + String(data);

  // AES encrypt (CryptoJS handles salt/iv internally)
  return CryptoJS.AES.encrypt(plaintext, sessionKey).toString();
}

function DecryptData(payload, sessionKey) {
  try {
    if (!sessionKey || !payload) return false;

    const bytes = CryptoJS.AES.decrypt(String(payload), sessionKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) return false;
    if (!decrypted.startsWith(sessionKey)) return false;

    return decrypted.slice(sessionKey.length);
  } catch {
    return false;
  }
}

// -----------------------

export const AppContextProvider = ({ children }) => {
  const listeners = useRef({});
  const refsHolder = useRef({});
  const [isHydrated, setIsHydrated] = useState(false);

  const defaultState = {
    deviceProperties: {
      screenSize: "sm",
      device: "desktop",
      touch: false,
      orientation: "landscape",
      pwa: false,
      popOutStateViewer: false,
      small: false,
      mainContentDimensions: {
        width: 0,
        height: 0,
        offsetLeft: 0,
        offsetRight: 0,
        offsetTop: 0,
        offsetBottom: 0,
      },
      areaDimensions: {
        width: 0,
        height: 0,
        offsetLeft: 0,
        offsetRight: 0,
        offsetTop: 0,
        offsetBottom: 0,
        windowHeight: 0,
      },
      windowDimensions: {
        width: 0,
        height: 0,
      },
      scrollData: {
        scrollShift: false,
        headerHeight: 0,
        headerBottomStatic: 0,
        headerBottom: 0,
        contentTopStatic: 0,
        contentTop: 0,
        contentHeight: 0,
        contentHeightStatic: 0,
        contentHeightMin: 0,
      },
    },

    // ✅ removed: user, session
    menu: null,
    notifications: [],

    // UI prefs
    prefs: {
      listGrid: "list",
      fullScreen: false,
      darkMode: true,
      filesView: "column",
    },

    // ✅ this replaces “accessToken” conceptually
    cacheKey: null,

    // ✅ backwards compat for your existing DataService:
    // DataService reads AppExport.state.accessToken as the encryption key.
    // We keep it, but it is NOT an auth token - it’s a local cache encryption key.
    accessToken: null,

    refs: {},
  };

  const loadStateFromLocalStorage = () => {
    try {
      const storedStateRaw = localStorage.getItem(process.env.NEXT_PUBLIC_LSVAR_APP_STATE);
      const storedState = storedStateRaw ? JSON.parse(storedStateRaw) : {};

      // Keep your existing key location so DataService stays untouched
      const storedKey = localStorage.getItem(process.env.NEXT_PUBLIC_LSVAR_ACCESS_TOKEN);

      const merged = {
        ...defaultState,
        ...storedState,
      };

      if (storedKey) {
        merged.cacheKey = storedKey;
        merged.accessToken = storedKey; // alias
      }

      return merged;
    } catch (err) {
      console.error("Error loading initial state:", err);
      return defaultState;
    }
  };

  const [state, setState] = useState(() => {
    if (typeof window !== "undefined") return loadStateFromLocalStorage();
    return defaultState;
  });

  const saveStateToLocalStorage = (nextState) => {
    try {
      // Don’t persist transient stuff like notifications/refs (same as your approach)
      const { notifications, refs, cacheKey, accessToken, ...persistedState } = nextState;

      localStorage.setItem(
        process.env.NEXT_PUBLIC_LSVAR_APP_STATE,
        JSON.stringify(persistedState),
      );

      // Persist cache key under the same env var your DataService reads
      const keyToPersist = cacheKey ?? accessToken ?? null;
      if (keyToPersist) {
        localStorage.setItem(process.env.NEXT_PUBLIC_LSVAR_ACCESS_TOKEN, keyToPersist);
      } else {
        localStorage.removeItem(process.env.NEXT_PUBLIC_LSVAR_ACCESS_TOKEN);
      }
    } catch (err) {
      console.error("Error saving state to localStorage:", err);
    }
  };

  useEffect(() => {
    const saved = loadStateFromLocalStorage();
    setState(saved);
    setIsHydrated(true);

    if (saved.prefs?.darkMode) {
      document.documentElement.classList.add("dark");
      updateMetaThemeColor("dark");
    } else {
      document.documentElement.classList.remove("dark");
      updateMetaThemeColor("light");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isHydrated) saveStateToLocalStorage(state);
  }, [state, isHydrated]);

  const updateMetaThemeColor = (mode) => {
    const color = mode === "dark" ? "#27272a" : "#f4f4f5";
    const themeMeta = document.querySelector("meta[name='theme-color']");
    if (themeMeta) themeMeta.setAttribute("content", color);
    else {
      const newMeta = document.createElement("meta");
      newMeta.setAttribute("name", "theme-color");
      newMeta.setAttribute("content", color);
      document.head.appendChild(newMeta);
    }
  };

  const updateState = (newStateOrCallback) => {
    setState((prevState) => {
      const next =
        typeof newStateOrCallback === "function" ? newStateOrCallback(prevState) : newStateOrCallback;

      if (typeof next !== "object" || next === null) {
        throw new Error("updateState expects an object or a function returning an object.");
      }

      const merged = { ...prevState, ...next };

      // keep cacheKey/accessToken alias in sync
      if (merged.cacheKey && !merged.accessToken) merged.accessToken = merged.cacheKey;
      if (merged.accessToken && !merged.cacheKey) merged.cacheKey = merged.accessToken;

      return merged;
    });
  };

  // Helpful explicit setter
  const setCacheKey = (key) => updateState({ cacheKey: key, accessToken: key });

  const setRefs = (refs) => {
    Object.keys(refs).forEach((key) => {
      refsHolder.current[key] = refs[key] ?? null;
    });
    updateState({ refs: refsHolder.current });
    emit("RefsUpdated");
  };

  const toggleDarkMode = () => {
    setState((prevState) => {
      const newDarkMode = !prevState.prefs.darkMode;
      document.documentElement.classList.toggle("dark", newDarkMode);
      updateMetaThemeColor(newDarkMode ? "dark" : "light");
      return { ...prevState, prefs: { ...prevState.prefs, darkMode: newDarkMode } };
    });
  };

  const toggleFullScreen = (force) => {
    setState((prevState) => {
      const newFullScreen = typeof force === "boolean" ? force : !prevState.prefs.fullScreen;
      return { ...prevState, prefs: { ...prevState.prefs, fullScreen: newFullScreen } };
    });
  };

  const addNotification = (notification) => {
    const notifications = [
      {
        id: Date.now(),
        expires: Date.now() + (((notification.duration ?? 5) * 1000) || 5000) + 10,
        style: "info",
        duration: 5,
        ...notification,
      },
      ...state.notifications,
    ];
    setState((prevState) => ({ ...prevState, notifications }));
  };

  const removeNotification = (id) => {
    setState((prevState) => ({
      ...prevState,
      notifications: prevState.notifications.filter((n) => n.id !== id),
    }));
  };

  // Event bus
  const listenersRef = listeners.current;
  const on = (event, callback) => {
    if (!listenersRef[event]) listenersRef[event] = [];
    listenersRef[event].push(callback);
    return () => off(event, callback);
  };
  const off = (event, callback) => {
    if (!listenersRef[event]) return;
    listenersRef[event] = listenersRef[event].filter((listener) => listener !== callback);
  };
  const emit = (event, data) => {
    if (!listenersRef[event]) return;
    listenersRef[event].forEach((listener) => listener(data));
  };
  const confirm = (confirmObj) => emit("confirm", confirmObj);

  const contextValue = {
    state,
    updateState,
    setRefs,
    setCacheKey,
    ui: {
      toggleDarkMode,
      toggleFullScreen,
    },
    events: { on, off, emit },
    notify: { add: addNotification, remove: removeNotification },
    interactions: { confirm },
    data: {
      encrypt: EncryptData,
      decrypt: DecryptData,
    },
  };

  // Preserve your global export pattern
  Object.assign(AppExport, contextValue);
  AppExport.encrypt = EncryptData;
  AppExport.decrypt = DecryptData;

  if (!isHydrated) return null;

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useAppContext = () => useContext(AppContext);