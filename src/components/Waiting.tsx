import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { abandonRequest, type JoinRequest } from '../data/family';

export function Waiting({ familyId, request }: { familyId: string; request: JoinRequest | null }) {
  let title = 'ממתין לאישור';
  let text = 'הבקשה נשלחה למנהל המשפחה. ברגע שיאשר, הרשימה תיפתח כאן מעצמה.';
  if (request?.status === 'rejected') {
    title = 'הבקשה לא אושרה';
    text = 'אפשר לבקש ממנהל המשפחה הזמנה חדשה.';
  } else if (!request || request.status === 'approved') {
    title = 'אין לך גישה למשפחה הזו';
    text = 'ייתכן שהוסרת מהמשפחה. אפשר לבקש הזמנה חדשה.';
  }
  const pending = request?.status === 'pending';
  return (
    <main className="center-page">
      <div className="brand-mark" aria-hidden="true">{pending ? '⏳' : '🔒'}</div>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      {!pending && (
        <button className="primary big" onClick={() => abandonRequest(familyId)}>
          יש לי קוד חדש
        </button>
      )}
      <button className="link muted" onClick={() => signOut(auth)}>
        התנתקות
      </button>
    </main>
  );
}
