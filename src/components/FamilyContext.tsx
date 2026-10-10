import { createContext, useContext } from 'react';
import type { Member } from '../data/family';
import type { TargetType } from '../data/comments';

export interface FamilyCtx {
  familyId: string;
  me: Member;
  members: Member[];
  commentCounts: Map<string, number>;
  openComments: (type: TargetType, id: string, title: string) => void;
}

export const FamilyContext = createContext<FamilyCtx | null>(null);

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily outside FamilyContext');
  return ctx;
}

export function memberName(members: Pick<Member, "id" | "displayName">[], uid: string | null | undefined) {
  if (!uid) return '';
  return members.find((m) => m.id === uid)?.displayName.split(' ')[0] ?? '';
}
