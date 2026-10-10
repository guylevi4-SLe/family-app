import { useEffect, useState } from 'react';
import { useDoc, useItems, useOnline, usePendingRequests } from '../data/hooks';
import type { Member } from '../data/family';
import { ShoppingList } from './ShoppingList';
import { FamilySettings } from './FamilySettings';

interface Family {
  name: string;
  deptOrder: string[];
}

export function Home({ familyId, me }: { familyId: string; me: Member }) {
  const family = useDoc<Family>(['families', familyId]);
  const items = useItems(familyId);
  const online = useOnline();
  const isAdmin = me.role === 'admin';
  const requests = usePendingRequests(familyId, isAdmin);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writeError, setWriteError] = useState('');

  useEffect(() => {
    const onError = () => setWriteError('שינוי אחד לא נשמר בשרת. ייתכן שההרשאות שלך השתנו.');
    window.addEventListener('write-error', onError);
    return () => window.removeEventListener('write-error', onError);
  }, []);

  const pendingCount = items?.filter((i) => i.pending).length ?? 0;
  const requestCount = requests?.length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{family?.name ?? ''}</h1>
        <SyncBadge online={online} pending={pendingCount} />
        <button className="icon-button" aria-label="הגדרות משפחה" onClick={() => setSettingsOpen(true)}>
          ⚙️
          {requestCount > 0 && <span className="dot" aria-label={`${requestCount} בקשות הצטרפות`} />}
        </button>
      </header>

      {isAdmin && requestCount > 0 && (
        <button className="banner" onClick={() => setSettingsOpen(true)}>
          {requestCount === 1 ? 'בקשת הצטרפות אחת ממתינה לאישורך' : `${requestCount} בקשות הצטרפות ממתינות לאישורך`}
        </button>
      )}
      {writeError && (
        <button className="banner error-banner" onClick={() => setWriteError('')}>
          {writeError}
        </button>
      )}

      <ShoppingList familyId={familyId} items={items} deptOrder={family?.deptOrder} />

      {settingsOpen && (
        <FamilySettings
          familyId={familyId}
          me={me}
          deptOrder={family?.deptOrder}
          pendingWrites={pendingCount}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SyncBadge({ online, pending }: { online: boolean; pending: number }) {
  if (!online) {
    return (
      <span className="sync offline" role="status">
        אין חיבור{pending > 0 ? ` · ${pending} ממתינים` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="sync pending" role="status">
        מסנכרן {pending}…
      </span>
    );
  }
  return (
    <span className="sync ok" role="status" aria-label="הכול מסונכרן">
      ✓
    </span>
  );
}
