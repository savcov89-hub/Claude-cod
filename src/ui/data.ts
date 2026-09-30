import { useCallback, useEffect, useState } from 'react';
import { api, inGym, isLocal, readError } from '../transport';
import { onRemoteChange } from '../local/runtime';
import { localDate } from '../clock';
import type { ClientItem, Exercise, Program } from '../types';

export interface TrainerData {
  clients: ClientItem[];
  programs: Program[];
  exercises: Exercise[];
  loading: boolean;
  errorText: string;
  setErrorText: (t: string) => void;
  reload: () => Promise<void>;
  reloadClients: () => Promise<void>;
  setPresence: (client: ClientItem, present: boolean) => Promise<void>;
}

export function useTrainerData(): TrainerData {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const reload = useCallback(async () => {
    try {
      const [c, p, e] = await Promise.all([api.get('/api/clients'), api.get('/api/programs'), api.get('/api/exercises')]);
      setClients(c.data.clients);
      setPrograms(p.data.programs);
      setExercises(e.data.exercises);
      setErrorText('');
    } catch (err) {
      setErrorText(readError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  const reloadClients = useCallback(async () => {
    try {
      const c = await api.get('/api/clients');
      setClients(c.data.clients);
    } catch (err) {
      setErrorText(readError(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    const refresh = () => document.visibilityState === 'visible' && void reload();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    const off = isLocal() ? onRemoteChange(() => void reload()) : () => undefined;
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      off();
    };
  }, [reload]);

  const setPresence = useCallback(async (client: ClientItem, present: boolean) => {
    try {
      const r = await api.post('/api/attendance', { clientId: client.clientId, present, localDate: localDate(), at: new Date().toISOString() });
      const today = localDate();
      setClients((list) =>
        list.map((c) =>
          c.clientId === client.clientId
            ? {
                ...c,
                checkedInAt: r.data.checkedInAt,
                visits: present ? Array.from(new Set([...(c.visits || []), today])) : c.visits,
              }
            : c,
        ),
      );
    } catch (err) {
      setErrorText(readError(err));
    }
  }, []);

  return { clients, programs, exercises, loading, errorText, setErrorText, reload, reloadClients, setPresence };
}

export const activeClients = (clients: ClientItem[]) => clients.filter((c) => !c.archived);
export const presentClients = (clients: ClientItem[]) =>
  activeClients(clients)
    .filter((c) => inGym(c.checkedInAt))
    .sort((a, b) => (a.checkedInAt || '').localeCompare(b.checkedInAt || ''));
export const programsOf = (programs: Program[], clientId: string) =>
  programs.filter((p) => p.clientId === clientId && !p.archived);
export const lastVisit = (c: ClientItem) => {
  const v = c.visits?.length ? c.visits[c.visits.length - 1] : null;
  const s = c.latestCompletedAt || c.insights?.lastSessionAt || null;
  if (v && s) return v > s.slice(0, 10) ? v + 'T12:00:00' : s;
  return s || (v ? v + 'T12:00:00' : null);
};
export const visits30 = (c: ClientItem) => {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return (c.visits || []).filter((d) => d >= from).length;
};
