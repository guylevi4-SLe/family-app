// End-to-end check of the stage-0 acceptance tests on two simulated phones:
// joining with approval, offline use (including a full app restart offline),
// sync after reconnecting, and the merge rules.
//
// Run: npm run test:e2e   (builds against the emulators and starts them)
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.APP_URL ?? 'http://localhost:4173';
const executablePath = process.env.CHROMIUM_PATH || undefined;
const phone = { ...devices['iPhone 13'], defaultBrowserType: undefined };
delete phone.defaultBrowserType;

const step = (m) => console.log(`\n▶ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

/** Opens the calendar screen on one side: 'לו״ז' (schedule) or 'משימות' (tasks). */
async function planner(page, side) {
  await page.getByRole('navigation').getByRole('button', { name: 'יומן' }).click();
  await page.getByRole('tablist', { name: 'יומן ומשימות' }).getByRole('tab', { name: side === 'tasks' ? /^משימות/ : 'לו״ז' }).click();
}

async function newPhone(browser, name) {
  const context = await browser.newContext({ ...phone, locale: 'he-IL' });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`  [${name} page error] ${e.message}`));
  // These phones chose the shopping list as their start screen (a personal setting).
  await context.addInitScript(() => {
    if (!localStorage.getItem('startScreen')) localStorage.setItem('startScreen', 'list');
  });
  await page.goto(BASE);
  await page.getByPlaceholder('שם לבדיקה (באנגלית)').fill(name);
  await page.getByRole('button', { name: 'כניסת בדיקה' }).click();
  return { context, page, name };
}

const list = (p) => p.page.locator('.list-page');
const row = (p, name) => p.page.locator('.row', { has: p.page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

async function add(p, text) {
  const box = p.page.getByLabel('הוספת מוצרים');
  await box.fill(text);
  await box.press('Enter');
}

async function names(p) {
  return (await list(p).locator('.dept:not(.bought):not(.deleted) .name').allTextContents()).sort();
}

async function waitSynced(p) {
  await p.page.locator('.sync.ok').waitFor({ timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ executablePath });
  try {
    step('Dad creates the family and adds products');
    const dad = await newPhone(browser, 'dad');
    await dad.page.getByRole('button', { name: /ליצור משפחה חדשה/ }).click();
    await dad.page.getByLabel('שם המשפחה').fill('משפחת בדיקה');
    await dad.page.getByRole('button', { name: 'יצירת משפחה' }).click();
    await dad.page.getByLabel('הוספת מוצרים').waitFor();
    await add(dad, 'חלב, לחם 2, עגבניות\nשמפו');
    await row(dad, 'לחם').waitFor();
    assert.deepEqual(await names(dad), ['חלב', 'לחם', 'עגבניות', 'שמפו']);
    const depts = await list(dad).locator('.dept h2').allTextContents();
    assert.deepEqual(depts, ['פירות וירקות', 'מוצרי חלב וביצים', 'לחם ומאפים', 'טיפוח והיגיינה']);
    assert.equal(await row(dad, 'לחם').locator('.qty').textContent(), '2');
    await add(dad, 'קילו בשר טחון');
    await row(dad, 'בשר טחון').waitFor();
    assert.equal(await row(dad, 'בשר טחון').locator('.qty').textContent(), 'קילו');
    await row(dad, 'בשר טחון').getByRole('button', { name: /עריכת/ }).click();
    await dad.page.getByRole('button', { name: 'מחיקה' }).click();
    ok('4 products added in one line, sorted into departments, quantity parsed ("קילו בשר טחון" too)');
    await dad.page.evaluate(() => {
      window.open = (url) => { window.__shared = String(url); return null; };
    });
    await dad.page.getByRole('button', { name: 'שליחת הרשימה לוואטסאפ' }).click();
    const sharedUrl = await dad.page.evaluate(() => window.__shared ?? '');
    const shared = new URL(sharedUrl).searchParams.get('text') ?? '';
    assert.match(shared, /\*לחם ומאפים\*\n• לחם \(2\)/);
    assert.ok(!shared.includes('\n\n'), 'no blank lines between departments');
    ok('WhatsApp button opens a share with the list grouped by department');

    step('Dad invites the daughter; she cannot see anything until approved');
    await dad.page.getByLabel('הגדרות').click();
    await dad.page.getByLabel('תפקיד').selectOption('child');
    await dad.page.getByRole('button', { name: 'יצירת הזמנה' }).click();
    const code = (await dad.page.locator('.invite code').first().textContent()).trim();
    assert.match(code, /^[A-Z2-9]{6}$/);
    ok(`invite code ${code}`);

    const kid = await newPhone(browser, 'kid');
    await kid.page.getByLabel('קוד הזמנה').fill(code);
    await kid.page.getByRole('button', { name: 'שליחת בקשה להצטרפות' }).click();
    await kid.page.getByText('ממתין לאישור').waitFor();
    ok('daughter waits for approval');

    // A forwarded link is useless: the invite is single-use.
    const stranger = await newPhone(browser, 'stranger');
    await stranger.page.getByLabel('קוד הזמנה').fill(code);
    await stranger.page.getByRole('button', { name: 'שליחת בקשה להצטרפות' }).click();
    await stranger.page.getByText('ההזמנה הזו כבר נוצלה').waitFor();
    ok('second person using the same code is refused');

    await dad.page.getByRole('button', { name: 'אישור', exact: true }).click();
    await dad.page.getByLabel('סגירה').click();
    await kid.page.getByLabel('הוספת מוצרים').waitFor({ timeout: 15000 });
    await row(kid, 'חלב').waitFor();
    ok('after approval the daughter sees the family list');

    step('Daughter goes offline, restarts the app, and keeps working');
    await kid.page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15000 }).catch(async () => {
      await kid.page.reload();
      await kid.page.waitForFunction(() => navigator.serviceWorker?.controller != null);
    });
    await kid.context.setOffline(true);
    await kid.page.reload();
    await row(kid, 'חלב').waitFor({ timeout: 15000 });
    ok('app opens offline after a full reload, list is there');
    await add(kid, 'במבה');
    await row(kid, 'במבה').waitFor();
    await row(kid, 'חלב').locator('.check-area').click();
    await kid.page.locator('.sync.offline', { hasText: 'ממתינים' }).waitFor();
    ok(`offline badge: "${(await kid.page.locator('.sync').textContent()).trim()}"`);

    await kid.page.reload();
    await row(kid, 'במבה').waitFor({ timeout: 15000 });
    await kid.page.locator('.sync.offline', { hasText: 'ממתינים' }).waitFor();
    ok('pending changes survive a restart while offline');

    step('Meanwhile Dad (online) edits; both edit the same products offline');
    await row(dad, 'לחם').getByRole('button', { name: /עריכת/ }).click();
    await dad.page.getByLabel('כמות').fill('3');
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    // Dad deletes "עגבניות" while the daughter (offline) renames its quantity.
    await row(dad, 'עגבניות').getByRole('button', { name: /עריכת/ }).click();
    await dad.page.getByRole('button', { name: 'מחיקה' }).click();
    await row(kid, 'עגבניות').getByRole('button', { name: /עריכת/ }).click();
    await kid.page.getByLabel('כמות').fill('1 ק"ג');
    await kid.page.getByRole('button', { name: 'שמירה' }).click();
    // Both add "ביצים".
    await add(dad, 'ביצים');
    await add(kid, 'ביצים 12');
    await waitSynced(dad);

    step('Daughter reconnects');
    await kid.context.setOffline(false);
    await kid.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitSynced(kid);
    await dad.page.waitForTimeout(1500);

    const dadNames = await names(dad);
    const kidNames = await names(kid);
    assert.deepEqual(dadNames, kidNames, 'both phones show the same list');
    assert.deepEqual(kidNames, ['ביצים', 'במבה', 'לחם', 'שמפו']);
    ok(`same list on both phones: ${kidNames.join(', ')}`);
    assert.equal(await row(kid, 'לחם').locator('.qty').textContent(), '3');
    ok("Dad's edit made while she was offline arrived");
    assert.equal(await row(dad, 'ביצים').count(), 1);
    ok('"ביצים" added on both phones became one item');
    await dad.page.getByRole('button', { name: /נקנו/ }).click();
    await row(dad, 'חלב').waitFor();
    ok('"חלב" checked offline arrived as bought');
    await dad.page.getByRole('button', { name: /נמחקו לאחרונה/ }).click();
    await dad.page.locator('.deleted .name', { hasText: 'עגבניות' }).waitFor();
    ok('delete beat a concurrent edit; item is in "recently deleted" for restore');

    if (process.env.SCREENSHOT_DIR) {
      await dad.page.getByRole('button', { name: /נמחקו לאחרונה/ }).click();
      await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/list.png` });
      await dad.page.getByRole('button', { name: /נמחקו לאחרונה/ }).click();
      await kid.context.setOffline(true);
      await add(kid, 'קפה, סוכר');
      await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/offline.png` });
      await kid.context.setOffline(false);
      await waitSynced(kid);
    }

    step('Restore and undo');
    await dad.page.locator('.deleted .row', { hasText: 'עגבניות' }).getByRole('button', { name: 'החזרה לרשימה' }).click();
    await row(kid, 'עגבניות').waitFor({ timeout: 10000 });
    ok('restored item reappears on the other phone');

    step('Home screen, tasks, calendar and comments');
    await kid.page.evaluate(() => localStorage.setItem('startScreen', 'home'));
    await kid.page.reload();
    await kid.page.locator('.tile', { hasText: 'רשימת קניות' }).waitFor();
    ok('start screen "home" shows the dashboard tiles');
    await planner(dad.page, 'tasks');
    await dad.page.getByLabel('משימה חדשה').fill('לתלות כביסה');
    await dad.page.getByRole('group', { name: 'אחראי' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('הוספת משימה').click();
    await kid.page.locator('.tile', { hasText: 'משימות' }).getByText('1 שלך: לתלות כביסה').waitFor({ timeout: 10000 });
    ok('task assigned by Dad shows on the daughter\'s home screen as hers');
    await kid.page.locator('.tile', { hasText: 'משימות' }).click();
    await kid.page.getByRole('tab', { name: /^משימות/, selected: true }).waitFor();
    await kid.page.locator('.row', { hasText: 'לתלות כביסה' }).getByRole('button', { name: /עריכת/ }).click();
    await kid.page.getByRole('dialog').getByRole('button', { name: /תגוב/ }).click();
    await kid.page.getByLabel('כתיבת תגובה').fill('אבל עשיתי אתמול!');
    await kid.page.getByLabel('כתיבת תגובה').press('Enter');
    await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).locator('.comment-chip', { hasText: '1' }).waitFor({ timeout: 10000 });
    await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).locator('.comment-chip').click();
    await dad.page.getByText('אבל עשיתי אתמול!').waitFor();
    ok('daughter commented on the task; Dad sees the comment count and the text');
    {
      await dad.page.getByLabel('סגירה').click();
      await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).getByRole('button', { name: /עריכת/ }).click();
      const sheet = dad.page.getByRole('dialog', { name: /עריכת/ });
      assert.equal(await sheet.getByRole('link', { name: 'יומן Google' }).count(), 0, 'no calendar export without a date');
      const d = new Date(); d.setDate(d.getDate() + 2);
      await sheet.getByLabel('תאריך יעד').fill(d.toLocaleDateString('sv-SE'));
      const href = await sheet.getByRole('link', { name: 'יומן Google' }).getAttribute('href');
      assert.ok(href.includes('calendar.google.com') && href.includes('dates='), 'Google calendar link for the task');
      let asked = '';
      dad.page.once('dialog', (dlg) => { asked = dlg.message(); });
      await sheet.getByRole('button', { name: 'שמירה' }).click();
      ok('a dated task can be added to Google or Apple calendar');
      assert.equal(asked, '', 'saving does not ask');
      await dad.page.getByLabel('משימה חדשה').fill('משימה למחיקה');
      await dad.page.getByLabel('הוספת משימה').click();
      await dad.page.locator('.row', { hasText: 'משימה למחיקה' }).getByRole('button', { name: /עריכת/ }).click();
      dad.page.once('dialog', (dlg) => { asked = dlg.message(); });
      await dad.page.getByRole('dialog', { name: /עריכת/ }).locator('button.danger').click();
      await dad.page.locator('.row', { hasText: 'משימה למחיקה' }).first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      assert.ok(asked.includes('למחוק את המשימה'), 'deleting a task asks first');
      ok('deleting a task asks for confirmation');
      await dad.page.getByLabel('משימה חדשה').fill('משימה לסימון');
      await dad.page.getByLabel('הוספת משימה').click();
      asked = '';
      dad.page.once('dialog', (dlg) => { asked = dlg.message(); });
      await dad.page.locator('.row', { hasText: 'משימה לסימון' }).locator('.check-area').click();
      await dad.page.waitForTimeout(300);
      assert.ok(asked.includes('כבוצע'), 'ticking a task asks first');
      ok('marking a task done asks for confirmation');
      await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).locator('.comment-chip').click();
    }
    await dad.page.getByLabel('בחירת תמונה').setInputFiles('public/icon-512.png');
    await dad.page.locator('.photo-preview img').waitFor();
    await dad.page.getByRole('dialog').getByRole('button', { name: 'שליחה' }).click();
    await kid.page.locator('.comment-photo img').waitFor({ timeout: 10000 });
    const src = await kid.page.locator('.comment-photo img').getAttribute('src');
    assert.ok(src.startsWith('data:image/jpeg;base64,') && src.length < 700000, 'photo stored as a small JPEG');
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/comment-photo.png` });
    ok('Dad attached a photo to a comment; the daughter sees it');
    await dad.page.getByRole('group', { name: 'לתייג את' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('כתיבת תגובה').fill('תזכורת בשבילך');
    await dad.page.getByLabel('כתיבת תגובה').press('Enter');
    await kid.page.locator('.comment', { hasText: 'תזכורת בשבילך' }).locator('.notified', { hasText: 'kid' }).waitFor({ timeout: 10000 });
    ok('a comment can name who gets a phone notification');
    await kid.page.goto(`${BASE}/?open=comments&type=item&id=${encodeURIComponent('לחם')}`);
    await kid.page.getByRole('dialog', { name: 'תגובות על לחם' }).waitFor({ timeout: 15000 });
    await kid.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('tapping a notification link opens that item\'s comments');
    await kid.page.evaluate(async (url) => (await caches.open('family-badge')).put('/__last-url', new Response(url)), `/?open=comments&type=item&id=${encodeURIComponent('לחם')}`);
    await kid.page.goto(BASE);
    await kid.page.getByRole('dialog', { name: 'תגובות על לחם' }).waitFor({ timeout: 15000 });
    await kid.page.getByRole('dialog').getByLabel('סגירה').click();
    await kid.page.reload();
    await kid.page.waitForTimeout(1500);
    assert.equal(await kid.page.getByRole('dialog', { name: 'תגובות על לחם' }).count(), 0, 'only jumps once per notification');
    ok('opening the app from its icon jumps to the newest unread notification, once');
    await dad.page.getByLabel('סגירה').click();

    await dad.page.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
    await dad.page.locator('.chat-ref', { hasText: 'תזכורת בשבילך' }).waitFor({ timeout: 10000 });
    ok('family chat lists comments made on items and tasks');
    await dad.page.locator('.chat-compose').getByRole('group', { name: 'הודעה ל' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('כתיבת הודעה').fill('ארוחת ערב ב־7');
    await dad.page.getByLabel('כתיבת הודעה').press('Enter');
    await kid.page.goto(`${BASE}/?open=chat`);
    await kid.page.locator('.comment', { hasText: 'ארוחת ערב ב־7' }).locator('.notified', { hasText: 'kid' }).waitFor({ timeout: 15000 });
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat.png` });
    ok('Dad wrote in the family chat for the daughter; her notification link opens the chat');
    {
      const bubble = dad.page.locator('.comment', { hasText: 'ארוחת ערב ב־7' });
      await bubble.getByRole('button', { name: 'אפשרויות להודעה' }).click();
      await dad.page.getByRole('menuitem', { name: /עריכה/ }).click();
      await dad.page.getByLabel('עריכת ההודעה').fill('ארוחת ערב ב־8');
      await dad.page.locator('.comment-edit').getByRole('button', { name: 'שמירה' }).click();
      await kid.page.locator('.comment', { hasText: 'ארוחת ערב ב־8' }).getByText('נערך').waitFor({ timeout: 15000 });
      await kid.page.locator('.comment', { hasText: 'ארוחת ערב ב־8' }).getByRole('button', { name: 'אפשרויות להודעה' }).click();
      await kid.page.getByRole('menuitem', { name: /שיתוף/ }).waitFor();
      assert.equal(await kid.page.getByRole('menuitem', { name: /עריכה/ }).count(), 0, 'only the author can edit');
      assert.equal(await kid.page.getByRole('menuitem', { name: /מחיקה/ }).count(), 0, 'others cannot delete');
      await kid.page.keyboard.press('Escape');
      assert.equal(await kid.page.getByRole('menu').count(), 0, 'Escape closes the menu');
      if (process.env.SCREENSHOT_DIR) {
        await dad.page.locator('.comment', { hasText: 'ארוחת ערב ב־8' }).getByRole('button', { name: 'אפשרויות להודעה' }).click();
        await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat-menu.png` });
        await dad.page.getByRole('menuitem', { name: /עריכה/ }).click();
        await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat-edit.png` });
        await dad.page.locator('.comment-edit').getByRole('button', { name: 'ביטול' }).click();
      }
    }
    ok('Dad edited his chat message; the daughter sees the new text marked as edited');
    {
      // Sharing on a phone goes through its share sheet (stubbed here to catch what is sent).
      await dad.page.evaluate(() => {
        window.__shared = null;
        navigator.share = async (d) => { window.__shared = d; };
      });
      await dad.page.locator('.comment', { hasText: 'ארוחת ערב ב־8' }).getByRole('button', { name: 'אפשרויות להודעה' }).click();
      await dad.page.getByRole('menuitem', { name: /שיתוף/ }).click();
      await dad.page.waitForFunction(() => window.__shared);
      assert.equal((await dad.page.evaluate(() => window.__shared)).text, 'ארוחת ערב ב־8', 'shares just the text');
      assert.equal(await dad.page.getByRole('menu').count(), 0, 'the menu closes after choosing');
      ok('the ⋯ menu shares a message through the phone share sheet');
    }
    {
      const size = dad.page.viewportSize();
      await dad.page.setViewportSize({ width: 320, height: size.height });
      const broken = await dad.page.evaluate(() =>
        [...document.querySelectorAll('.comment-meta > *')]
          .filter((el) => el.getClientRects().length > 1 || el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight || '20') * 1.6 + 8)
          .map((el) => el.textContent),
      );
      await dad.page.setViewportSize(size);
      assert.deepEqual(broken, [], 'message header text never wraps mid-word');
    }
    await kid.page.locator('.chat-ref').first().click();
    await kid.page.getByRole('dialog', { name: /תגובות על/ }).waitFor();
    await kid.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('tapping a comment line in the chat opens that item');
    const overflow = await kid.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'chat page has no sideways scroll');

    {
      // Newer desktop browsers return a promise from scrollIntoView; an effect that
      // hands it back to React crashed the screen when leaving the chat.
      await kid.page.evaluate(() => {
        const orig = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...a) {
          orig.apply(this, a);
          return Promise.resolve();
        };
      });
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      await kid.page.locator('.chat-compose').waitFor();
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.waitForTimeout(300);
      assert.equal(await kid.page.locator('.crash').count(), 0, 'leaving the chat never crashes the screen');
      ok('leaving the chat is safe where scrolling returns a promise');
    }

    step('Chat commands');
    {
      const p = dad.page;
      const box = p.getByLabel('כתיבת הודעה');
      const notice = p.locator('.command-notice');
      const send = async (text) => {
        await box.fill(text);
        await box.press('Enter');
      };
      await box.fill('@');
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat-command-hints.png` });
      await p.getByRole('group', { name: 'פקודות מהירות' }).getByRole('button', { name: /@ק/ }).click();
      assert.equal(await box.inputValue(), '@קניות: ', 'picking a suggested command fills it in');
      await box.fill('');
      await box.pressSequentially('@ר');
      assert.equal(await box.inputValue(), '@רשימה: ', 'typing @ר grows into @רשימה:');
      for (let i = 0; i < 7; i++) await box.press('Backspace');
      assert.equal(await box.inputValue(), '@', 'deleting back does not grow it again');
      await send('@ק במבה, 2 חלב');
      await notice.filter({ hasText: 'נוספו 2 מוצרים לקניות' }).waitFor();
      assert.equal(await box.inputValue(), '', 'a command clears the box');
      await p.locator('.comment', { hasText: '🛒 לקניות: במבה, חלב (2)' }).waitFor();
      ok('"@ק במבה, 2 חלב" adds to shopping and tells the family in the chat');

      await send('@מ להחליף נורה מחר לkid');
      await notice.filter({ hasText: 'נוספה משימה: להחליף נורה' }).waitFor();
      await p.locator('.comment', { hasText: /✅ משימה: להחליף נורה · kid · מחר/ }).waitFor();
      ok('"@מ … מחר לkid" adds a task due tomorrow, assigned to the daughter');

      await send('@י חוג');
      await notice.filter({ hasText: 'חסר יום או תאריך' }).waitFor();
      assert.equal(await box.inputValue(), '@י חוג', 'a command missing its date stays in the box to fix');
      await send('@י חוג ציור כל חמישי 17:00');
      await notice.filter({ hasText: /נקבע ביומן: חוג ציור.*17:00 · כל שבוע/ }).waitFor();
      ok('"@י … כל חמישי 17:00" adds a weekly event; a missing date is explained, not sent');

      await send('@ר ציוד לסקי: כפפות, כובע');
      await notice.filter({ hasText: 'נוצרה רשימה חדשה "ציוד לסקי" עם 2 פריטים' }).waitFor();
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat-command-done.png` });
      await notice.getByRole('button', { name: 'ביטול' }).click();
      await notice.filter({ hasText: 'בוטלה' }).waitFor();
      await p.locator('.comment', { hasText: 'ציוד לסקי' }).waitFor({ state: 'detached' });
      await send('@ר ציוד לסקי: כפפות');
      await notice.filter({ hasText: 'נוצרה רשימה חדשה' }).waitFor();
      await send('@ר ציוד סקי: משקפת');
      await notice.filter({ hasText: 'נוסף ל"ציוד לסקי": משקפת' }).waitFor();
      await notice.getByRole('button', { name: 'פתיחה' }).click();
      const page = p.getByRole('main', { name: 'רשימות' });
      await page.getByText('משקפת').waitFor();
      await page.getByText('כפפות').waitFor();
      assert.equal(await page.getByText('כובע').count(), 0, 'the cancelled list left nothing behind');
      ok('"@ר" creates a missing list (with undo) and finds an existing one despite a typo');
      await p.getByRole('navigation').getByRole('button', { name: 'קניות' }).click();
      await p.getByText('במבה').first().waitFor();
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();

      await send('@קניות: -במבה');
      await notice.filter({ hasText: 'הוסר: במבה' }).waitFor();
      await notice.getByRole('button', { name: 'ביטול' }).click();
      await notice.filter({ hasText: 'הוחזר לקניות: במבה' }).waitFor();
      await p.waitForTimeout(500);
      await send('@קניות: -גבינה');
      await notice.filter({ hasText: 'גבינה לא ברשימת הקניות' }).waitFor();
      assert.equal(await box.inputValue(), '@קניות: -גבינה', 'removing something not on the list stays in the box');
      await send('@קניות: -במבה');
      await notice.filter({ hasText: 'הוסר: במבה' }).waitFor();
      await p.locator('.comment', { hasText: '🗑️ הוסר מהקניות: במבה' }).waitFor();
      await p.getByRole('navigation').getByRole('button', { name: 'קניות' }).click();
      await p.getByText('חלב').first().waitFor();
      assert.equal(await p.locator('main').getByText('במבה', { exact: true }).count(), 0, 'במבה left the shopping list');
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      ok('"@קניות: -במבה" removes from shopping, with undo; an unknown product is explained');

      await send('@משימה: -להחליף נורה');
      await notice.filter({ hasText: 'סומן כבוצע: להחליף נורה' }).waitFor();
      await send('@רשימה: ציוד סקי: -משקפת');
      await notice.filter({ hasText: 'הוסר מ"ציוד לסקי": משקפת' }).waitFor();
      await notice.getByRole('button', { name: 'ביטול' }).click();
      await notice.filter({ hasText: 'הוחזר ל"ציוד לסקי": משקפת' }).waitFor();
      ok('a minus also ticks off a task and removes a list line (with undo)');
    }

    {
      const p = dad.page;
      await p.getByRole('navigation').getByRole('button', { name: 'רשימות' }).click();
      await p.getByRole('button', { name: 'חזרה למסך הבית' }).click();
      await p.locator('main.dashboard').waitFor();
      assert.equal(await p.getByRole('button', { name: 'חזרה למסך הבית' }).count(), 0, 'the home screen shows the plain logo');
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      ok('the logo next to each screen title leads back home');
    }

    {
      const p = dad.page;
      await p.getByRole('navigation').getByRole('button', { name: 'קניות' }).click();
      const off = await p.getByRole('button', { name: 'שליחת הרשימה לוואטסאפ' }).evaluate((b) => {
        const r = b.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - document.documentElement.clientWidth / 2);
      });
      assert.ok(off <= 2, `the WhatsApp button is centred (off by ${off}px)`);
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      ok('the shopping list WhatsApp button is centred');
      await p.getByRole('navigation').getByRole('button', { name: 'קניות' }).click();
      await p.evaluate(() => {
        window.__shared = null;
        navigator.share = async (d) => { window.__shared = d; };
      });
      await p.getByRole('button', { name: /תגובה על חלב|תגובות על חלב/ }).first().click();
      const sheet = p.getByRole('dialog', { name: 'תגובות על חלב' });
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/item-notes.png` });
      await sheet.getByLabel('כתיבת תגובה').fill('איזה אחוז שומן?');
      await sheet.getByRole('button', { name: /לשלוח כשאלה בוואטסאפ/ }).click();
      await p.waitForFunction(() => window.__shared);
      assert.equal((await p.evaluate(() => window.__shared)).text, 'שאלה על "חלב" מרשימת הקניות:\nאיזה אחוז שומן?');
      await sheet.locator('.comment', { hasText: '❓ איזה אחוז שומן?' }).waitFor();
      await sheet.getByLabel('סגירה').click();
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      ok('a product note can be sent as a WhatsApp question, and stays in its notes');
    }

    step('Long chat history');
    {
      const p = dad.page;
      const box = p.getByLabel('כתיבת הודעה');
      for (let i = 1; i <= 55; i++) {
        await box.fill(`הודעה מספר ${i}`);
        await box.press('Enter');
      }
      await p.locator('.comment', { hasText: 'הודעה מספר 55' }).waitFor();
      await p.reload();
      await p.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
      await p.locator('.comment', { hasText: 'הודעה מספר 55' }).waitFor();
      const shown = await p.locator('.chat .comment, .chat .chat-ref').count();
      assert.equal(shown, 50, 'the chat reads only the newest 50 messages');
      assert.equal(await p.locator('.comment', { hasText: /^.*הודעה מספר 5$/ }).count(), 0, 'older messages wait for the button');
      await p.getByRole('button', { name: 'הודעות קודמות' }).click();
      await p.locator('.comment', { hasText: 'ארוחת ערב' }).waitFor();
      assert.ok((await p.locator('.chat .comment, .chat .chat-ref').count()) > 50, '"הודעות קודמות" loads more');
      ok('the chat loads the newest 50 messages, and older ones on request');
      await planner(p, 'tasks');
      await p.getByRole('button', { name: /^\d+ תגובות על לתלות כביסה/ }).first().click();
      await p.getByRole('dialog', { name: 'תגובות על לתלות כביסה' }).locator('.comment', { hasText: 'תזכורת בשבילך' }).waitFor();
      await p.getByRole('dialog').getByLabel('סגירה').click();
      ok('an item still shows its whole comment thread, however old');
    }

    step('Swipe between screens');
    {
      const cdp = await kid.page.context().newCDPSession(kid.page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const swipe = async (x0, x1, y = 400, steps = 6) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
        for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y + i }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await kid.page.waitForTimeout(300);
      };
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      const w = await kid.page.evaluate(() => innerWidth);
      await swipe(w * 0.6, w * 0.45);
      assert.equal(await kid.page.locator('.topbar h1').innerText().then((t) => t.includes('קניות')), false, 'a short swipe does nothing');
      await swipe(w * 0.85, w * 0.15);
      await kid.page.locator('.topbar h1', { hasText: 'קניות' }).waitFor({ timeout: 3000 });
      await swipe(w * 0.15, w * 0.85);
      await kid.page.locator('.tile', { hasText: 'רשימת קניות' }).waitFor({ timeout: 3000 });
      await cdp.detach();
    }
    ok('a long sideways swipe moves between screens; a short one does not');

    step('Weekly timetable');
    const pdfPage = await dad.page.context().newPage();
    await pdfPage.setContent('<h1>מערכת שעות</h1><table border=1><tr><td>ראשון</td><td>מתמטיקה</td></tr><tr><td>שני</td><td>אנגלית</td></tr></table>');
    const pdfPath = `${process.env.TMPDIR || '/tmp'}/timetable-e2e.pdf`;
    await pdfPage.pdf({ path: pdfPath, format: 'A4' });
    await pdfPage.close();
    await planner(dad.page, 'schedule');
    await dad.page.getByRole('button', { name: '📚 מערכת שעות' }).click();
    await dad.page.getByRole('dialog', { name: 'מערכת שעות' }).getByRole('group', { name: 'של מי' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('בחירת קובץ מערכת').setInputFiles(pdfPath);
    await dad.page.locator('.schedule-img img').waitFor({ timeout: 20000 });
    const sched = await dad.page.locator('.schedule-img img').getAttribute('src');
    assert.ok(sched.startsWith('data:image/jpeg;base64,') && sched.length < 950000, 'PDF rendered to a JPEG');
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('Dad uploaded a PDF timetable for the daughter');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.locator('.schedule-tile').click();
    await kid.page.getByRole('dialog', { name: 'מערכת שעות' }).locator('.schedule-img img').waitFor({ timeout: 10000 });
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/schedule.png` });
    await kid.page.locator('.schedule-img').click();
    const viewer = kid.page.getByRole('dialog', { name: 'מערכת השעות שלי' });
    const before = await viewer.locator('img').evaluate((i) => i.getBoundingClientRect().width);
    const vw = await kid.page.evaluate(() => innerWidth);
    assert.ok(before <= vw + 1, 'whole timetable fits the screen at first');
    await viewer.getByRole('button', { name: 'הגדלה' }).click();
    await viewer.getByRole('button', { name: 'הגדלה' }).click();
    const after = await viewer.locator('img').evaluate((i) => i.getBoundingClientRect().width);
    assert.ok(after > before * 2, 'zoom makes it bigger');
    const scrollable = await viewer.locator('.zoom-box').evaluate((b) => b.scrollWidth > b.clientWidth);
    assert.ok(scrollable, 'zoomed timetable can be scrolled sideways, not cut');
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/schedule-zoom.png` });
    await viewer.getByRole('button', { name: 'סגירה' }).click();
    await kid.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('the daughter sees "my timetable" on her home screen and opens it');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await dad.page.locator('.schedule-tile', { hasText: 'מערכת שעות' }).locator('.schedule-thumb').waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-schedule.png` });
    await dad.page.locator('.schedule-tile').click();
    await dad.page.getByRole('dialog', { name: 'מערכת שעות' }).getByRole('heading', { name: /של kid/ }).waitFor();
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('Dad sees the children\'s timetable on his own home screen too');
    await planner(dad.page, 'schedule');
    await dad.page.getByRole('button', { name: '📚 מערכת שעות' }).click();
    await dad.page.getByRole('dialog', { name: 'מערכת שעות' }).getByRole('heading', { name: /של kid/ }).waitFor();
    assert.equal(await dad.page.getByRole('group', { name: 'של מי' }).locator('[aria-pressed=true]').innerText().then((t) => t.includes('kid')), true, 'only the daughter is selected');
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('from the calendar, the timetable opens on the only member who has one');

    step('Birthdays');
    {
      await planner(dad.page, 'schedule');
      await dad.page.getByRole('button', { name: '🎂 ימי הולדת' }).click();
      const book = dad.page.getByRole('dialog', { name: 'ימי הולדת' });
      await book.getByRole('button', { name: '+ יום הולדת' }).click();
      const t = new Date();
      t.setDate(t.getDate() + 1);
      await book.getByPlaceholder('למשל: סבתא רחל').fill('סבתא רחל');
      await book.getByLabel('חודש').selectOption(String(t.getMonth() + 1));
      await book.getByLabel('יום').selectOption(String(t.getDate()));
      await book.getByPlaceholder('למשל 1985').fill('1950');
      await book.getByRole('button', { name: 'הוספה' }).click();
      await book.locator('.bday', { hasText: 'סבתא רחל' }).getByText(`מחר · ימלאו ${t.getFullYear() - 1950}`).waitFor();
      await book.getByRole('button', { name: '+ יום הולדת' }).click();
      await book.getByPlaceholder('למשל: סבתא רחל').fill('דני');
      await book.getByRole('group', { name: 'קבוצה' }).getByRole('button', { name: 'חברים' }).click();
      await book.getByRole('button', { name: 'הוספה' }).click();
      await book.locator('.bday', { hasText: 'דני' }).waitFor();
      if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/birthdays.png` });
      await book.locator('.bday', { hasText: 'סבתא רחל' }).click();
      const href = await book.getByRole('link', { name: 'יומן גוגל' }).getAttribute('href');
      assert.equal(new URL(href).searchParams.get('recur'), 'RRULE:FREQ=YEARLY', 'Google copy repeats every year');
      await book.getByRole('button', { name: 'ביטול' }).click();
      await book.getByLabel('סגירה').click();
      await dad.page.locator('.birthday-row', { hasText: 'סבתא רחל' }).waitFor();
      await planner(kid.page, 'schedule');
      await kid.page.locator('.birthday-row', { hasText: 'סבתא רחל' }).waitFor({ timeout: 10000 });
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.locator('.tile', { hasText: 'יומן' }).getByText('יום הולדת לסבתא רחל').waitFor();
    }
    ok('Dad added birthdays; they show in everyone\'s schedule and home screen, and export as yearly events');

    step('Checklists');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await dad.page.locator('.lists-tile').getByRole('button').first().click();
    const lists = dad.page.locator('.lists-page');
    await lists.getByRole('button', { name: '+ רשימה חדשה' }).click();
    await lists.getByRole('group', { name: 'רעיונות' }).getByRole('button', { name: /ציוד לטיול/ }).click();
    await lists.getByRole('button', { name: 'יצירת הרשימה' }).click();
    await lists.getByLabel('הוספת שורות').fill('אוהל, שק שינה');
    await lists.getByLabel('הוספת שורות').press('Enter');
    const answer = async (text, act) => {
      dad.page.removeAllListeners('dialog');
      dad.page.once('dialog', (d) => d.accept(text));
      await act();
      await dad.page.waitForTimeout(200);
      dad.page.on('dialog', (d) => d.accept());
    };
    await answer('ביגוד', () => lists.getByRole('button', { name: '+ קטגוריה' }).click());
    await lists.getByLabel('הוספת שורות').fill('חולצות, מכנסיים, גרביים');
    await lists.getByLabel('הוספת שורות').press('Enter');
    await answer('רחצה', () => lists.getByRole('button', { name: '+ קטגוריה' }).click());
    await lists.getByLabel('הוספת שורות').fill('מברשת שיניים, משחה');
    await lists.getByLabel('הוספת שורות').press('Enter');
    await lists.locator('.list-section', { hasText: 'רחצה' }).locator('.entry', { hasText: 'משחה' }).waitFor();
    await lists.locator('.list-section', { hasText: 'ביגוד' }).locator('.entry', { hasText: 'גרביים' }).waitFor();
    await lists.locator('.entry', { hasText: 'אוהל' }).locator('.entry-check').click();
    await lists.getByText('1 מתוך 7 מסומנים').waitFor();
    const gap = await lists.locator('.list-section', { hasText: 'ביגוד' }).locator('.entry').evaluateAll((els) => els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().bottom);
    assert.ok(gap <= 2, `lines sit right under each other (gap ${gap}px)`);
    await dad.page.evaluate(() => { window.open = (u) => { window.__opened = u; return null; }; });
    await lists.getByRole('button', { name: 'שליחת הרשימה לוואטסאפ' }).click();
    const sent = decodeURIComponent(new URL(await dad.page.evaluate(() => window.__opened)).searchParams.get('text'));
    assert.ok(sent.includes('*ציוד לטיול*') && sent.includes('*ביגוד*') && sent.includes('✅ אוהל') && sent.includes('▫️ משחה'), `WhatsApp text: ${sent}`);
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/list-detail.png` });
    await lists.getByRole('button', { name: '→ כל הרשימות' }).click();
    await lists.locator('.list-card', { hasText: 'ציוד לטיול' }).getByText('1 מתוך 7').waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/lists.png` });
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.locator('.lists-tile').getByRole('button', { name: /ציוד לטיול/ }).click();
    const kidLists = kid.page.locator('.lists-page');
    await kidLists.locator('.entry.checked', { hasText: 'אוהל' }).waitFor({ timeout: 10000 });
    await kidLists.getByRole('button', { name: '↺ ניקוי סימונים' }).click();
    await kidLists.getByText('0 מתוך 7 מסומנים').waitFor();
    await kidLists.getByRole('button', { name: '→ כל הרשימות' }).click();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'רשימות' }).click();
    await kidLists.locator('.list-card', { hasText: 'ציוד לטיול' }).waitFor();
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-lists.png`, fullPage: true });
    ok('Dad made a trip packing list with categories; the daughter opens it from home and from the bottom bar, and resets the ticks');

    await planner(dad.page, 'schedule');
    await dad.page.getByRole('button', { name: '+ אירוע חדש' }).click();
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('חוג ציור');
    await dad.page.locator('input[type=time]').fill('17:30');
    await dad.page.getByRole('group', { name: 'מי משתתף' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    await kid.page.reload();
    await planner(kid.page, 'schedule');
    await kid.page.locator('.row', { hasText: 'חוג ציור' }).getByText('17:30').waitFor({ timeout: 10000 });
    ok('event added by Dad appears in the daughter\'s calendar');
    await dad.page.getByRole('button', { name: '+ אירוע חדש' }).click();
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('טיול שנתי');
    await dad.page.getByLabel('כמה ימים').check();
    const dayLabelFor = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
    const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    await dad.page.getByLabel('מתאריך').fill(iso(1));
    await dad.page.getByLabel('עד תאריך').fill(iso(3));
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    await dad.page.locator('.row', { hasText: 'טיול שנתי' }).locator('.until').waitFor();
    ok('multi-day event saved with an end date');
    await dad.page.getByRole('button', { name: '+ אירוע חדש' }).click();
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('שיעור פרטי');
    await dad.page.getByLabel('תאריך', { exact: true }).fill(iso(1));
    await dad.page.locator('.sheet input[type=time]').fill('16:00');
    await dad.page.getByLabel('חוזר כל שבוע').check();
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    for (const n of [1, 8, 15]) {
      await dad.page.locator('.dept', { hasText: dayLabelFor(n) }).locator('.row', { hasText: 'שיעור פרטי' }).waitFor({ timeout: 5000 });
    }
    assert.ok(await dad.page.locator('.row', { hasText: 'שיעור פרטי' }).first().innerText().then((t) => t.includes('🔁 כל')), 'weekly label');
    ok('a weekly event shows up every week');
    await dad.page.getByRole('button', { name: 'לוח חודשי' }).click();
    for (const n of [1, 2, 3]) {
      const day = new Date(); day.setDate(day.getDate() + n);
      if (day.getMonth() !== new Date().getMonth()) continue;
      await dad.page.locator('.month-grid .day', { has: dad.page.locator('.num', { hasText: new RegExp(`^${day.getDate()}$`) }) }).locator('.mark.ev').waitFor();
    }
    await dad.page.locator('.month-grid .day.today .mark.ev').waitFor();
    await dad.page.getByRole('button', { name: '+ משימה ביום הזה' }).click();
    await dad.page.getByPlaceholder('למשל: לקנות מתנה לסבתא').fill('לקנות מתנה');
    await dad.page.getByRole('dialog').getByRole('button', { name: 'kid' }).click();
    await dad.page.getByRole('dialog').getByRole('button', { name: 'הוספה' }).click();
    await dad.page.locator('.month .row', { hasText: 'לקנות מתנה' }).getByText('kid').waitFor();
    await dad.page.locator('.month-grid .day.today .mark.tk').waitFor();
    await kid.page.locator('.row', { hasText: 'לקנות מתנה' }).waitFor({ timeout: 10000 });
    ok('month view marks today; a task added on a calendar day shows there and in the daughter\'s calendar');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/calendar-month.png` });
    if (process.env.SCREENSHOT_DIR) {
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home.png` });
    }

    step('Removed member loses access');
    await dad.page.getByLabel('הגדרות').click();
    await dad.page.locator('.person', { hasText: 'kid' }).getByRole('button', { name: 'הסרה' }).click();
    await kid.page.getByText('אין לך גישה למשפחה הזו').waitFor({ timeout: 15000 }).catch(async (e) => {
      console.log('  [debug] kid page:', (await kid.page.locator('body').innerText()).slice(0, 300).replace(/\n/g, ' | '));
      throw e;
    });
    ok('daughter removed → access gone immediately');

    if (process.env.SCREENSHOT_DIR) {
      await dad.page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click().catch(() => {});
      await dad.page.getByRole('button', { name: 'קניות' }).click();
      await add(dad, 'עגבניות, מלפפונים, 2 אבוקדו, חצי קילו ענבים, בצל, שישייה מים\nחלב 3%, 10 ביצים, גבינה צהובה, קוטג׳\nפיתות, קילו חזה עוף, אורז, פסטה, במבה, שקיות זבל, נייר טואלט');
      await row(dad, 'נייר טואלט').waitFor();
      await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/list-long.png` });
      for (const [label, file] of [['שחור וזהב', 'list-gold.png'], ['ירוק (הקלאסי)', 'list-green.png'], ['ורוד ולבן', 'list-pink.png'], ['כתום ולבן', 'list-orange.png'], ['לבן וזהב', null]]) {
        await dad.page.getByRole('button', { name: 'הגדרות' }).click();
        const wide = await dad.page.evaluate(() => {
          const sheet = document.querySelector('.sheet');
          const w = document.documentElement.clientWidth;
          const out = [...sheet.querySelectorAll('*')]
            .filter((el) => { const r = el.getBoundingClientRect(); return r.right > w + 1 || r.left < -1; })
            .slice(0, 5)
            .map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`);
          return { sheet: [sheet.scrollWidth, sheet.clientWidth], out };
        });
        assert.deepEqual(wide.out, [], `settings sheet overflows sideways: ${JSON.stringify(wide)}`);
        if (!file) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/settings.png` });
        await dad.page.getByRole('dialog').getByRole('button', { name: label }).click();
        await dad.page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click();
        if (file) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${file}` });
      }
      await planner(dad.page, 'tasks');
      await dad.page.getByText('למי:').waitFor();
      await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/tasks.png` });
    }
    if (process.env.STRESS) {
      await dad.page.setViewportSize({ width: 1280, height: 800 });
      await dad.page.reload();
      await dad.page.getByRole('navigation').waitFor();
      const errs = [];
      dad.page.on('pageerror', (e) => errs.push(e.message));
      const tabs = ['בית', 'קניות', 'יומן', 'רשימות', 'צ׳אט'];
      for (let i = 0; i < 200; i++) {
        const t = tabs[Math.floor(Math.random() * tabs.length)];
        await dad.page.getByRole('navigation').getByRole('button', { name: t }).click();
        if (t === 'יומן') await dad.page.getByRole('tab', { name: Math.random() < 0.5 ? /^משימות/ : 'לו״ז' }).click();
        if (t === 'רשימות' && Math.random() < 0.5) await dad.page.locator('.list-card').first().click().catch(() => {});
        await dad.page.waitForTimeout(Math.random() * 100);
        const st = await dad.page.evaluate(() => ({ app: !!document.querySelector('.app'), main: document.querySelector('main')?.innerText.length ?? -1 }));
        if (!st.app || st.main <= 0) console.log('BLANK', i, t, JSON.stringify(st));
      }
      console.log('stress errors:', JSON.stringify([...new Set(errs)]));
    }
    console.log('\nALL CHECKS PASSED');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
