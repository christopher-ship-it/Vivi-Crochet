import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { devCustomerLogin, testAccountLogin } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import type { LoginResponse, User } from '../types';
import {
  clearLearningCustomer,
  clearShoppingSession,
  loadLearningCustomer,
  loadShoppingSession,
  saveLearningCustomer,
  saveShoppingSession,
  type LearningCustomerProfile,
  type StoredSession,
} from './storage';

interface ShoppingSessionValue {
  user: User | null;
  isAuthenticated: boolean;
  completeSignIn: (response: LoginResponse) => Promise<void>;
  signInDev: (phone: string, name?: string) => Promise<void>;
  signInWithTestCode: (secret: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface LearningCustomerValue {
  profile: LearningCustomerProfile | null;
  saveProfile: (profile: LearningCustomerProfile) => Promise<void>;
  clearProfile: () => Promise<void>;
}

interface SessionContextValue {
  isLoading: boolean;
  shopping: ShoppingSessionValue;
  learning: LearningCustomerValue;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [shoppingUser, setShoppingUser] = useState<User | null>(null);
  const [learningProfile, setLearningProfile] = useState<LearningCustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setShoppingUser(null);
      void clearShoppingSession();
    });

    Promise.all([loadShoppingSession(), loadLearningCustomer()]).then(([shopping, learning]) => {
      if (shopping) setShoppingUser(shopping.user);
      if (learning) setLearningProfile(learning);
      setIsLoading(false);
    });
  }, []);

  const completeSignIn = useCallback(async (response: LoginResponse) => {
    const session: StoredSession = {
      accessToken: response.accessToken,
      expiresAt: response.expiresAt,
      user: response.user,
    };
    await saveShoppingSession(session);
    setShoppingUser(response.user);
  }, []);

  const signInDev = useCallback(
    async (phone: string, name?: string) => {
      const response = await devCustomerLogin(phone, name);
      await completeSignIn(response);
    },
    [completeSignIn],
  );

  const signInWithTestCode = useCallback(
    async (secret: string) => {
      const response = await testAccountLogin(secret);
      await completeSignIn(response);
    },
    [completeSignIn],
  );

  const signOut = useCallback(async () => {
    await clearShoppingSession();
    setShoppingUser(null);
  }, []);

  const saveProfile = useCallback(async (profile: LearningCustomerProfile) => {
    await saveLearningCustomer(profile);
    setLearningProfile(profile);
  }, []);

  const clearProfile = useCallback(async () => {
    await clearLearningCustomer();
    setLearningProfile(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoading,
      shopping: {
        user: shoppingUser,
        isAuthenticated: !!shoppingUser,
        completeSignIn,
        signInDev,
        signInWithTestCode,
        signOut,
      },
      learning: {
        profile: learningProfile,
        saveProfile,
        clearProfile,
      },
    }),
    [
      isLoading,
      shoppingUser,
      learningProfile,
      completeSignIn,
      signInDev,
      signInWithTestCode,
      signOut,
      saveProfile,
      clearProfile,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function useShoppingSession(): ShoppingSessionValue {
  return useSession().shopping;
}

export function useLearningCustomer(): LearningCustomerValue {
  return useSession().learning;
}
