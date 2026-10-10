'use strict';
// Pure helpers for comment notifications (no Firebase imports, so they are unit-testable).

const TARGET_COLLECTION = { item: 'items', task: 'tasks', event: 'events' };

/** Who should get a push: listed, family members, not the author, at most 20. */
function recipients(comment, memberIds) {
  const wanted = Array.isArray(comment.notify) ? comment.notify : [];
  const members = new Set(memberIds);
  return [...new Set(wanted)].filter((uid) => uid !== comment.authorUid && members.has(uid)).slice(0, 20);
}

/** The text shown on the lock screen. */
function message(comment, targetTitle) {
  const who = comment.authorName || 'מישהו מהמשפחה';
  const about = comment.targetType === 'chat' ? ' · צ׳אט משפחתי' : targetTitle ? ` · ${targetTitle}` : '';
  const text = (comment.text || '').trim();
  const body = text ? (text.length > 140 ? `${text.slice(0, 139)}…` : text) : '📷 תמונה';
  return { title: `${who}${about}`, body };
}

/** Where tapping the notification lands. */
function link(comment) {
  if (comment.targetType === 'chat') return '/?open=chat';
  const q = new URLSearchParams({ open: 'comments', type: comment.targetType, id: comment.targetId });
  return `/?${q}`;
}

module.exports = { TARGET_COLLECTION, recipients, message, link };
