import { createContext, useContext } from 'react';
import { useStore, type StoreApi, type UseBoundStore } from 'zustand';
import { useSession, type SessionState } from '../session';

/** 通しループが使うセッションのストア(既定はアプリ全体の useSession。テストでは別のものを渡す) */
export type SessionStore = UseBoundStore<StoreApi<SessionState>>;

export const SessionContext = createContext<SessionStore>(useSession);

export function useFlowStore(): SessionStore {
  return useContext(SessionContext);
}

/** セッションの一部を読む(新しい配列・オブジェクトを返す selector は useShallow で包むこと) */
export function useFlow<T>(selector: (s: SessionState) => T): T {
  return useStore(useFlowStore(), selector);
}
