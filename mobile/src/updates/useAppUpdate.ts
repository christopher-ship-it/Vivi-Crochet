import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

export function useAppUpdate() {
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;

    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;

      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        setReady(true);
        setDismissed(false);
      }
    } catch {
      // Silent: network / channel issues should not interrupt browsing.
    }
  }, []);

  useEffect(() => {
    void check();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => sub.remove();
  }, [check]);

  const apply = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setApplying(false);
    }
  }, [applying]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    available: ready && !dismissed,
    applying,
    apply,
    dismiss,
  };
}
