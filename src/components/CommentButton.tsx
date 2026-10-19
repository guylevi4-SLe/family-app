import type { TargetType } from '../data/comments';
import { commentKey } from '../data/comments';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

/** Speech-bubble with the comment count (0 when none) next to every row; `always` is the labelled button inside sheets. */
export function CommentButton({ type, id, title, always = false }: { type: TargetType; id: string; title: string; always?: boolean }) {
  const { commentCounts, openComments } = useFamily();
  const count = commentCounts.get(commentKey(type, id)) ?? 0;
  // Shopping items have "notes"; tasks and events have "comments".
  const [many, one] = type === 'item' ? ['הערות', 'הערה'] : ['תגובות', 'תגובה'];
  const label = count ? `${count} ${many} על ${title}` : `הוספת ${one} על ${title}`;
  if (!always) {
    return (
      <button
        className={count ? 'comment-chip has' : 'comment-chip'}
        aria-label={label}
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
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        openComments(type, id, title);
      }}
    >
      <Icon name="chat" size={16} />
      {count ? ` ${count}` : ` ${many}`}
    </button>
  );
}
