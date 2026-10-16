import { useCallback, useEffect, useRef, useState } from 'react';

export const WORKSPACE_MOBILE_QUERY = '(max-width: 1024px)';

function readBoolean(key: string) {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function useWorkspaceSidebar(storagePrefix: string) {
  const [mobileNavOpen, setMobileNavOpen] = useState(() =>
    window.matchMedia(WORKSPACE_MOBILE_QUERY).matches && readBoolean(`${storagePrefix}.mobileNavOpen`));
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() => readBoolean(`${storagePrefix}.desktopNavCollapsed`));
  const [sidebarTransitionEnabled, setSidebarTransitionEnabled] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${storagePrefix}.mobileNavOpen`, String(mobileNavOpen));
      window.localStorage.setItem(`${storagePrefix}.desktopNavCollapsed`, String(desktopNavCollapsed));
    } catch {
      // Storage restrictions should not prevent sidebar interaction.
    }
  }, [storagePrefix, mobileNavOpen, desktopNavCollapsed]);

  useEffect(() => {
    const media = window.matchMedia(WORKSPACE_MOBILE_QUERY);
    let frame = 0;
    const enableTransitions = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setSidebarTransitionEnabled(true));
      });
    };
    const onBreakpointChange = () => {
      setSidebarTransitionEnabled(false);
      setMobileNavOpen(false);
      enableTransitions();
    };
    enableTransitions();
    media.addEventListener('change', onBreakpointChange);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener('change', onBreakpointChange);
    };
  }, []);

  const handleDesktopToggle = useCallback(() => setDesktopNavCollapsed(value => !value), []);
  const handleMobileOpen = useCallback(() => {
    if (window.matchMedia(WORKSPACE_MOBILE_QUERY).matches) setMobileNavOpen(true);
  }, []);
  const handleMobileClose = useCallback(() => setMobileNavOpen(false), []);
  return {
    mobileNavOpen, desktopNavCollapsed, sidebarTransitionEnabled,
    mobileTriggerRef, handleDesktopToggle, handleMobileOpen, handleMobileClose,
  };
}
