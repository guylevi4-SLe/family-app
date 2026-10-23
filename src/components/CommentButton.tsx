import type { TargetType } from '../data/comments';
import { commentKey } from '../data/comments';
import { useFamily } from './FamilyContext';
import { Icon } from './Icon';

/** Speech-bubble with the comment count (0 when none) next to every row; `always` is the labelled button inside sheets. */
export function CommentButton({ type, id, title, always = false }: { type: TargetType; id: string; title: string; always?: boolean }) {
  const { commentCounts, itemPhotos, openComments } = useFamily();
  const count = commentCounts.get(commentKey(type, id)) ?? 0;
  // Shopping items have "notes"; tasks and events have "comments".
  const [many, one] = type === 'item' ? ['הערות', 'הערה'] : ['תגובות', 'תגובה'];
  const photo = type === 'item' && itemPhotos.has(id);
  const label = (count ? `${count} ${many} על ${title}` : `הוספת ${one} על ${title}`) + (photo ? ', עם תמונה' : '');
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
        {photo && <Icon name="camera" size={15} />}
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
