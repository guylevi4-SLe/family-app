import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: { id: string; data: Record<string, unknown> }[] = [];
vi.mock('../src/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_col: unknown, id: string) => ({ id }),
  serverTimestamp: () => 'now',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: () => ({
    set: (ref: { id: string }, data: Record<string, unknown>) => writes.push({ id: ref.id, data }),
    commit: () => Promise.resolve(),
  }),
}));

import { addItems, addStaplesToList, type Item } from '../src/data/items';

const staple = (fields: Partial<Item>): Item => ({
  id: 'נטורינה',
  name: 'נטורינה',
  norm: 'נטורינה',
  qty: '',
  category: 'מוצרי חלב וביצים',
  checked: false,
  deleted: true,
  updatedBy: 'u1',
  pending: false,
  staple: true,
  usualQty: '2',
  ...fields,
});

describe('adding staples to the list', () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it('puts a renamed staple back on the list under its own document', () => {
    const it = staple({ name: 'נטורינה בטעם ניטרלי' });
    addStaplesToList('f1', [it], new Map([[it.id, it]]), new Map());
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('נטורינה');
    expect(writes[0].data).toMatchObject({ name: 'נטורינה בטעם ניטרלי', norm: 'נטורינה', qty: '2', deleted: false, checked: false });
  });

  it('still files a typed product under its normalized name', () => {
    addItems('f1', [{ name: 'חלב', qty: '' }], new Map(), new Map());
    expect(writes[0].id).toBe('חלב');
  });
});
