import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { recipients, message, link } = createRequire(import.meta.url)('../functions/notify.js');

describe('comment notifications', () => {
  const comment = { authorUid: 'dad', authorName: 'גיא', text: 'את הקמח של סוגת', targetType: 'item', targetId: 'קמח' };

  it('notifies only listed family members, never the author or outsiders', () => {
    expect(recipients({ ...comment, notify: ['ravit', 'dad', 'stranger', 'ravit'] }, ['dad', 'ravit', 'kid'])).toEqual(['ravit']);
    expect(recipients(comment, ['dad', 'ravit'])).toEqual([]);
  });

  it('builds the lock-screen text', () => {
    expect(message(comment, 'קמח')).toEqual({ title: 'גיא · קמח', body: 'את הקמח של סוגת' });
    expect(message({ ...comment, text: '' }, 'קמח').body).toBe('📷 תמונה');
    expect(message({ ...comment, text: 'א'.repeat(300) }, '').body.length).toBe(140);
  });

  it('family chat messages say so and open the chat', () => {
    const chat = { ...comment, targetType: 'chat', targetId: 'family' };
    expect(message(chat, '').title).toBe('גיא · צ׳אט משפחתי');
    expect(link(chat)).toBe('/?open=chat');
  });

  it('links to the comment thread', () => {
    expect(link(comment)).toBe('/?open=comments&type=item&id=%D7%A7%D7%9E%D7%97');
  });
});
