import type { TargetType } from '../data/comments';
import { commentKey } from '../data/comments';
import { useFamily } from './FamilyContext';

/** Small speech-bubble with a count; hidden when there are no comments unless `always`. */
export function CommentButton({ type, id, title, always = false }: { type: TargetType; id: string; title: string; always?: boolean }) {
  const { commentCounts, openComments } = useFamily();
  const count = commentCounts.get(commentKey(type, id)) ?? 0;
  if (!count && !always) return null;
  return (
    <button
      className={always ? 'small' : 'comment-chip'}
      aria-label={count ? `${count} תגובות על ${title}` : `הוספת תגובה על ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        openComments(type, id, title);
      }}
    >
      💬{count ? ` ${count}` : always ? ' תגובות' : ''}
    </button>
  );
}
