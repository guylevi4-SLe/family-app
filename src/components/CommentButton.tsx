import type { TargetType } from '../data/comments';
import { commentKey } from '../data/comments';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

/** Speech-bubble with the comment count (0 when none) next to every row; `always` is the labelled button inside sheets. */
export function CommentButton({ type, id, title, always = false }: { type: TargetType; id: string; title: string; always?: boolean }) {
  const { commentCounts, openComments } = useFamily();
  const count = commentCounts.get(commentKey(type, id)) ?? 0;
  if (!always) {
    return (
      <button
        className={count ? 'comment-chip has' : 'comment-chip'}
        aria-label={count ? `${count} תגובות על ${title}` : `הוספת תגובה על ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          openComments(type, id, title);
        }}
      >
        <Icon name="chat" size={18} />
        {count}
      </button>
    );
  }
  return (
    <button
      className="small"
      aria-label={count ? `${count} תגובות על ${title}` : `הוספת תגובה על ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        openComments(type, id, title);
      }}
    >
      💬{count ? ` ${count}` : ' תגובות'}
    </button>
  );
}
