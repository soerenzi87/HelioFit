import { useRef, useEffect } from 'react';
import { Language } from '../types';
import { apiFetch } from '../services/apiFetch';

export const getDbKey = (p: { email?: string; name: string }) => p.email || p.name;

export function useDbSave(
  db: Record<string, any>,
  isDbLoaded: boolean,
  isSuperLoggedIn: boolean,
  language: Language
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (isDbLoaded && isSuperLoggedIn && Object.keys(db).length > 0) {
      localStorage.setItem('heliofit_lang', language);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await apiFetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbRef.current)
          });
        } catch (e) {
          console.error("Failed to save DB to server", e);
        }
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [db, isDbLoaded, isSuperLoggedIn, language]);
}
