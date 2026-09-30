import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { dismissFailures, onOfflineChange, outbox, outboxFailures } from '../offline';

/** No network, records waiting to be sent, or records the server refused after the network came back. */
export function OfflineBar({ userId }: { userId: string }) {
  const read = () => ({
    online: typeof navigator === 'undefined' || navigator.onLine,
    waiting: outbox(userId).length,
    failed: outboxFailures(userId),
  });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    update();
    return onOfflineChange(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const { online, waiting, failed } = state;
  return (
    <>
      {(!online || waiting > 0) && (
        <div className={'offline-bar' + (online ? ' sending' : '')} role="status">
          <WifiOff size={15} />
          <span>
            {online
              ? `Отправляем записи, сделанные без сети: ${waiting}…`
              : 'Нет сети. Показаны сохранённые данные; подходы и отметки записываются на телефон и отправятся сами.' +
                (waiting ? ` Ждут отправки: ${waiting}.` : '')}
          </span>
        </div>
      )}
      {failed.length > 0 && (
        <div className="alert offline-failed">
          <span>Не удалось отправить после появления сети:</span>
          <ul>
            {failed.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <button className="btn btn-sm" onClick={() => dismissFailures(userId)}>
            Понятно
          </button>
        </div>
      )}
    </>
  );
}
