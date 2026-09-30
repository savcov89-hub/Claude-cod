import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, ClipboardList, Dumbbell, LayoutDashboard, Users } from 'lucide-react';
import type { Profile } from '../types';
import { presentClients, useTrainerData } from './data';
import { Gym } from './Gym';
import { Dashboard } from './Dashboard';
import { Clients } from './Clients';
import { ClientCard } from './ClientCard';
import { Programs } from './Programs';
import { Library } from './Library';
import { ProgramBuilder, type BuilderOptions } from './ProgramBuilder';

type Tab = 'gym' | 'dash' | 'clients' | 'programs' | 'library';

/** `onSwitchRole` offers «Я клиент» while the account is still empty (a role picked by mistake). */
export function TrainerApp({ header, onSwitchRole }: { profile: Profile; header: ReactNode; onSwitchRole?: () => void }) {
  const data = useTrainerData();
  const [tab, setTab] = useState<Tab>('gym');
  const [card, setCard] = useState<{ id: string; tab?: string } | null>(null);
  const [builder, setBuilder] = useState<BuilderOptions | null>(null);
  const present = presentClients(data.clients).length;
  const reviews = data.clients.filter((c) => c.needsReview && !c.archived).length;

  const openClient = (id: string, t?: string) => setCard({ id, tab: t });
  const openBuilder = (opts: BuilderOptions) => setBuilder(opts);
  const go = (t: Tab) => {
    setTab(t);
    setCard(null);
    setBuilder(null);
  };

  const nav: Array<[Tab, string, ReactNode, number]> = [
    ['gym', 'Зал', <Dumbbell size={20} key="i" />, present],
    ['dash', 'Сводка', <LayoutDashboard size={20} key="i" />, reviews],
    ['clients', 'Клиенты', <Users size={20} key="i" />, 0],
    ['programs', 'Программы', <ClipboardList size={20} key="i" />, 0],
    ['library', 'База', <BookOpen size={20} key="i" />, 0],
  ];
  const overlay = builder ? 'builder' : card ? 'card' : null;

  // On phones only .main scrolls; iOS can leave the whole page shifted after the keyboard closes.
  useEffect(() => {
    const settle = () =>
      setTimeout(() => {
        const locked = getComputedStyle(document.documentElement).overflowY === 'hidden';
        if (locked && window.scrollY && !(document.activeElement instanceof HTMLInputElement)) window.scrollTo(0, 0);
      }, 100);
    document.addEventListener('focusout', settle);
    return () => document.removeEventListener('focusout', settle);
  }, []);

  return (
    <div className="app has-nav">
      {header}
      <nav className="nav" aria-label="Разделы">
        {nav.map(([k, label, icon, badge]) => (
          <button key={k} className={'nav-item' + (tab === k && !overlay ? ' on' : '')} onClick={() => go(k)} aria-current={tab === k && !overlay ? 'page' : undefined}>
            {icon}
            <span>{label}</span>
            {badge > 0 && <b className="badge num">{badge}</b>}
          </button>
        ))}
      </nav>
      <main className="main">
        {data.errorText && <div className="alert">{data.errorText}</div>}
        {data.loading ? (
          <div className="loader-block"><span className="loader" /></div>
        ) : (
          <>
            <div hidden={tab !== 'gym' || !!overlay}>
              <Gym data={data} openClient={openClient} openBuilder={(clientId) => openBuilder({ clientId })} onSwitchRole={onSwitchRole} />
            </div>
            {overlay === 'builder' && (
              <ProgramBuilder
                clients={data.clients}
                exercises={data.exercises}
                options={builder!}
                onExerciseCreated={() => void data.reload()}
                onClose={() => setBuilder(null)}
                onSaved={async () => {
                  setBuilder(null);
                  await data.reload();
                }}
              />
            )}
            {overlay === 'card' && (
              <ClientCard
                key={card!.id + (card!.tab || '')}
                data={data}
                clientId={card!.id}
                initialTab={card!.tab}
                onBack={() => setCard(null)}
                openBuilder={openBuilder}
              />
            )}
            {!overlay && tab === 'dash' && <Dashboard data={data} openClient={openClient} />}
            {!overlay && tab === 'clients' && <Clients data={data} openClient={openClient} />}
            {!overlay && tab === 'programs' && <Programs data={data} openBuilder={openBuilder} />}
            {!overlay && tab === 'library' && <Library exercises={data.exercises} onCreated={data.reload} />}
          </>
        )}
      </main>
    </div>
  );
}
