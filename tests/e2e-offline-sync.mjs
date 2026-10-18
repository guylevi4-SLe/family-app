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
// The calendar's ⋮ menu and floating "+" open a sheet of actions.
async function calMenu(page, button, item) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('dialog', { name: new RegExp(`^${button}`) }).getByRole('button', { name: item }).click();
}

// The calendar opens on the month grid; "upcoming" is the list of what comes next.
async function upcomingView(page) {
  const toList = page.getByRole('button', { name: 'תצוגת רשימה' });
  if (await toList.count()) await toList.click();
}

// The library's floating "+" offers a new note, list or folder.
async function addNew(scope, item) {
  await scope.getByRole('button', { name: 'הוספה', exact: true }).click();
  await scope.page().getByRole('dialog', { name: /^הוספה/ }).getByRole('button', { name: item }).click();
}

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
    assert.deepEqual(depts, ['פירות וירקות', 'מוצרי חלב וביצים', 'לחם ומאפים', 'טיפוח, היגיינה ופארם']);
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

    // Prices: ticking asks nothing; after shopping, "רישום מחירים" under "נקנו" takes prices for the bought items.
    await row(dad, 'לחם').getByRole('button', { name: 'שינוי כמות לחם', exact: true }).click();
    const qtySheet = dad.page.getByRole('dialog', { name: 'עריכת לחם' });
    await qtySheet.getByText('כמות').waitFor();
    assert.equal(await row(dad, 'לחם').locator('.check-area').getAttribute('aria-pressed'), 'false', 'tapping the quantity does not tick the item');
    await qtySheet.getByRole('button', { name: 'שמירה' }).click();
    await qtySheet.waitFor({ state: 'detached' });
    ok('tapping the quantity opens the edit sheet');
    await add(dad, "קוטג' 3%");
    await row(dad, "קוטג' 3%").locator('.check-area').click();
    assert.equal(await dad.page.getByLabel('מחיר ששולם').count(), 0, 'ticking does not ask for a price');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/bought-toast.png` });
    await dad.page.getByRole('button', { name: 'רישום מחירים' }).click();
    const paidSheet = dad.page.getByRole('dialog', { name: 'מחירים מהקנייה' });
    await paidSheet.getByLabel('חנות').fill('רמי לוי');
    await paidSheet.getByLabel("מחיר קוטג' 3%").fill('5,90');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/price-after.png` });
    await paidSheet.getByRole('button', { name: 'שמירה (1)' }).click();
    await paidSheet.waitFor({ state: 'detached' });
    await add(dad, "קוטג'");
    await row(dad, "קוטג'").waitFor();
    assert.equal(await row(dad, "קוטג'").locator('.price-tag').count(), 0, 'no price is guessed for a different name');
    await row(dad, "קוטג'").getByRole('button', { name: /עריכת/ }).click();
    const kindSheet = dad.page.getByRole('dialog', { name: /עריכת/ });
    await kindSheet.getByRole('group', { name: 'סוגים שקניתם בעבר' }).getByRole('button', { name: /קוטג' 3%/ }).click();
    // Wait for the row on the open list: it is bought until the pick lands, and the bought section is open.
    const tag = dad.page.locator('.dept:not(.bought):not(.deleted) .row', { has: dad.page.locator('.name', { hasText: /^קוטג' 3%$/ }) })
      .getByRole('button', { name: 'מחיר אחרון ₪5.90 ברמי לוי' });
    await tag.waitFor({ timeout: 10000 });
    const rowH = await row(dad, "קוטג' 3%").evaluate((el) => el.getBoundingClientRect().height);
    const plainH = await row(dad, 'לחם').evaluate((el) => el.getBoundingClientRect().height);
    assert.equal(rowH, plainH, 'the price tag does not make the row taller');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/price-tag.png` });
    await tag.click();
    await kindSheet.getByRole('list', { name: 'היסטוריית מחירים' }).getByText('רמי לוי').waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/price-sheet.png` });
    await kindSheet.getByRole('button', { name: 'מחיקה' }).click();
    await row(dad, "קוטג' 3%").waitFor({ state: 'detached' });
    ok('a price paid is kept per product, shown as a small tag, and "קוטג\'" can become the kind bought before');

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
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
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
    await kid.page.waitForFunction(() => ![...document.querySelectorAll('.dept:not(.bought):not(.deleted) .name')].some((n) => n.textContent === 'חלב'));
    await kid.page.locator('.sync.offline', { hasText: 'ממתינים' }).waitFor();
    ok(`offline badge: "${(await kid.page.locator('.sync').textContent()).trim()}"`);

    await kid.page.reload();
    await row(kid, 'במבה').waitFor({ timeout: 15000 });
    await kid.page.locator('.sync.offline', { hasText: 'ממתינים' }).waitFor();
    ok('pending changes survive a restart while offline');

    step('Meanwhile Dad (online) edits; both edit the same products offline');
    await row(dad, 'לחם').getByRole('button', { name: /עריכת/ }).click();
    await dad.page.getByRole('dialog').getByLabel('כמות').fill('3');
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    // Dad deletes "עגבניות" while the daughter (offline) renames its quantity.
    await row(dad, 'עגבניות').getByRole('button', { name: /עריכת/ }).click();
    await dad.page.getByRole('button', { name: 'מחיקה' }).click();
    await row(kid, 'עגבניות').getByRole('button', { name: /עריכת/ }).click();
    await kid.page.getByRole('dialog').getByLabel('כמות').fill('1 ק"ג');
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
    // The bought section opens by itself; recently deleted stays closed.
    await row(dad, 'חלב').waitFor();
    assert.equal(await dad.page.locator('.deleted .name').count(), 0);
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

    step('Bought more than a week ago moves to "recently deleted", even offline');
    await row(dad, 'שמפו').locator('.check-area').click();
    await kid.page.waitForFunction(() => ![...document.querySelectorAll('.dept:not(.bought):not(.deleted) .name')].some((n) => n.textContent === 'שמפו'));
    await kid.context.setOffline(true);
    await kid.page.clock.setSystemTime(new Date(Date.now() + 8 * 86400000));
    // Any re-render re-checks the dates; toggling the bought section is one
    // (unless a re-render already emptied it).
    await kid.page.evaluate(() => document.querySelector('.bought .section-head button')?.click());
    await kid.page.getByRole('button', { name: /נמחקו לאחרונה/ }).click();
    await kid.page.locator('.deleted .name', { hasText: 'שמפו' }).waitFor({ timeout: 10000 });
    assert.equal(await kid.page.locator('.bought .name', { hasText: 'שמפו' }).count(), 0);
    ok('a week later, offline, "שמפו" left "bought in the last week" for "recently deleted"');
    await kid.page.clock.setSystemTime(new Date());
    await kid.context.setOffline(false);
    await kid.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitSynced(kid);
    await dad.page.locator('.deleted .name', { hasText: 'שמפו' }).waitFor({ timeout: 10000 });
    ok('the move reached the other phone after reconnecting');
    await dad.page.locator('.deleted .row', { hasText: 'שמפו' }).getByRole('button', { name: 'החזרה לרשימה' }).click();
    await row(kid, 'שמפו').waitFor({ timeout: 10000 });

    step('Home screen, tasks, calendar and comments');
    await kid.page.evaluate(() => localStorage.setItem('startScreen', 'home'));
    await kid.page.reload();
    await kid.page.locator('.topbar h1', { hasText: "Levi's" }).waitFor();
    await kid.page.locator('.greeting', { hasText: 'kid · יום' }).waitFor();
    // Right after the reload the tile can still be waiting for the list.
    const shopTile = kid.page.locator('.tile', { hasText: 'קניות' });
    await shopTile.locator('.tile-body', { hasText: /\d+ פריטים/ }).waitFor({ timeout: 10000 });
    const toBuy = Number(await shopTile.locator('.tile-count').innerText());
    assert.equal(await shopTile.locator('.tile-body').innerText(), `${toBuy} פריטים`);
    assert.equal(await kid.page.locator('.tile-grid .tile').count(), 6, 'six squares');
    ok('start screen "home" shows the six squares under "Levi\'s" and a greeting');
    await planner(dad.page, 'tasks');
    await dad.page.getByLabel('משימה חדשה').fill('לתלות כביסה');
    await dad.page.getByRole('group', { name: 'אחראי' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('הוספת משימה').click();
    await kid.page.locator('.tile', { hasText: 'משימות' }).getByText('1 שלך', { exact: true }).waitFor({ timeout: 10000 });
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
    await dad.page.getByLabel('בחירת תמונה', { exact: true }).setInputFiles('public/icon-pink-512.png');
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
    // Typing "@k" offers the daughter's name; picking it tags her (and notifies her).
    await dad.page.getByLabel('כתיבת הודעה').fill('@');
    await dad.page.getByRole('group', { name: 'פקודות מהירות' }).getByRole('button', { name: '@kid' }).click();
    assert.equal(await dad.page.getByLabel('כתיבת הודעה').inputValue(), '@kid ');
    await dad.page.getByLabel('כתיבת הודעה').fill('');
    await dad.page.getByLabel('כתיבת הודעה').pressSequentially('@k');
    assert.equal(await dad.page.getByLabel('כתיבת הודעה').inputValue(), '@kid ', 'only one name fits "@k": it completes by itself');
    await dad.page.getByLabel('כתיבת הודעה').pressSequentially('ארוחת ערב ב־7');
    if (process.env.SCREENSHOT_DIR) {
      await dad.page.getByLabel('כתיבת הודעה').fill('ארוחת ערב ב־7 @');
      await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat-tag.png` });
      await dad.page.getByLabel('כתיבת הודעה').fill('@kid ארוחת ערב ב־7');
    }
    await dad.page.getByLabel('כתיבת הודעה').press('Enter');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    const chatTile = kid.page.locator('.tile', { hasText: 'צ׳אט' });
    await chatTile.locator('.tile-count').waitFor({ timeout: 15000 });
    assert.match(await chatTile.locator('.tile-body').innerText(), /^(הודעה חדשה|\d+ הודעות חדשות)$/);
    ok('the daughter\'s chat square counts the new messages');
    await kid.page.goto(`${BASE}/?open=chat`);
    await kid.page.locator('.comment', { hasText: 'ארוחת ערב ב־7' }).locator('.notified', { hasText: 'kid' }).waitFor({ timeout: 15000 });
    await kid.page.locator('.comment', { hasText: 'ארוחת ערב ב־7' }).locator('.tag', { hasText: '@kid' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/chat.png` });
    ok('Dad wrote in the family chat for the daughter; her notification link opens the chat');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.locator('.tile', { hasText: 'צ׳אט' }).getByText('אין הודעות חדשות').waitFor();
    assert.equal(await kid.page.locator('.tile', { hasText: 'צ׳אט' }).locator('.tile-count').count(), 0);
    ok('after reading the chat the square shows nothing new');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'צ׳אט' }).click();
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
      await box.fill('');
      await box.pressSequentially('@רשימה');
      assert.equal(await box.inputValue(), '@רשימה: ', 'typing the whole word after it completed does not repeat it');
      await box.fill('');
      await box.pressSequentially('@רש');
      assert.equal(await box.inputValue(), '@רשימה: ', '@רש completes too');
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
      const page = p.getByRole('main', { name: 'פתקים' });
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
      await p.getByRole('navigation').getByRole('button', { name: 'פתקים' }).click();
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
        navigator.canShare = () => true;
      });
      await p.getByRole('button', { name: /(הערה|הערות) על חלב/ }).first().click();
      const sheet = p.getByRole('dialog', { name: 'תגובות על חלב' });
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/item-notes.png` });
      await sheet.getByLabel('כתיבת תגובה').fill('איזה אחוז שומן?');
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/ask-button.png` });
      await sheet.getByRole('button', { name: 'שאלה על המוצר בוואטסאפ' }).click();
      const askBox = p.getByRole('dialog', { name: 'שאלה בוואטסאפ' });
      assert.equal(await askBox.getByRole('textbox', { name: 'השאלה' }).inputValue(), 'איזה אחוז שומן?', 'what was typed carries over');
      await askBox.getByLabel('בחירת תמונה לשאלה').setInputFiles('public/icon-pink-512.png');
      await askBox.getByRole('img', { name: 'התמונה שתצורף לשאלה' }).waitFor();
      if (process.env.SCREENSHOT_DIR) await p.screenshot({ path: `${process.env.SCREENSHOT_DIR}/ask-photo.png` });
      await askBox.getByRole('button', { name: 'שליחה בוואטסאפ' }).click();
      await p.waitForFunction(() => window.__shared);
      assert.deepEqual(await p.evaluate(() => ({ text: window.__shared.text, files: (window.__shared.files ?? []).length })), { text: 'שאלה על "חלב" מרשימת הקניות:\nאיזה אחוז שומן?', files: 1 });
      await askBox.waitFor({ state: 'detached' });
      assert.equal(await sheet.getByLabel('כתיבת תגובה').inputValue(), '', 'the note box is cleared');
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
      // The newest message sits above the compose box, not hidden under it.
      await p.waitForTimeout(500);
      const lastBottom = await p.locator('.comment', { hasText: 'הודעה מספר 55' }).evaluate((e) => e.getBoundingClientRect().bottom);
      const composeTop = await p.locator('.chat-compose').evaluate((e) => e.getBoundingClientRect().top);
      assert.ok(lastBottom <= composeTop + 1, `the chat opens at its newest message (${lastBottom} vs ${composeTop})`);
      const shown = await p.locator('.chat .comment, .chat .chat-ref').count();
      assert.equal(shown, 50, 'the chat reads only the newest 50 messages');
      assert.equal(await p.locator('.comment', { hasText: /^.*הודעה מספר 5$/ }).count(), 0, 'older messages wait for the button');
      await p.getByRole('button', { name: 'הודעות קודמות' }).click();
      await p.locator('.comment', { hasText: 'ארוחת ערב' }).waitFor();
      assert.ok((await p.locator('.chat .comment, .chat .chat-ref').count()) > 50, '"הודעות קודמות" loads more');
      ok('the chat opens at its newest message and loads the newest 50, older ones on request');
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
      await kid.page.locator('.tile-grid').waitFor({ timeout: 3000 });
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
    await calMenu(dad.page, 'אפשרויות', 'מערכת שעות');
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
    // Sharing the image hands the phone's share sheet a real image file.
    await kid.page.evaluate(() => {
      window.__shared = null;
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__shared = d.files.map((f) => `${f.type} ${f.size > 1000}`).join(); };
    });
    await viewer.getByRole('button', { name: 'שיתוף התמונה' }).click();
    assert.match(await kid.page.evaluate(() => window.__shared), /^image\/\w+ true$/);
    await viewer.getByRole('button', { name: 'סגירה' }).click();
    await kid.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('the daughter sees "my timetable" on her home screen and opens it');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await dad.page.locator('.schedule-tile', { hasText: 'לחיצה לפתיחה' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-schedule.png` });
    await dad.page.locator('.schedule-tile').click();
    await dad.page.getByRole('dialog', { name: 'מערכת שעות' }).getByRole('heading', { name: /של kid/ }).waitFor();
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('Dad sees the children\'s timetable on his own home screen too');
    await planner(dad.page, 'schedule');
    await calMenu(dad.page, 'אפשרויות', 'מערכת שעות');
    await dad.page.getByRole('dialog', { name: 'מערכת שעות' }).getByRole('heading', { name: /של kid/ }).waitFor();
    assert.equal(await dad.page.getByRole('group', { name: 'של מי' }).locator('[aria-pressed=true]').innerText().then((t) => t.includes('kid')), true, 'only the daughter is selected');
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    ok('from the calendar, the timetable opens on the only member who has one');

    step('Birthdays');
    {
      await planner(dad.page, 'schedule');
      await calMenu(dad.page, 'אפשרויות', 'ימי הולדת');
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
      await upcomingView(dad.page);
      await dad.page.locator('.birthday-row', { hasText: 'סבתא רחל' }).waitFor();
      await planner(kid.page, 'schedule');
      await upcomingView(kid.page);
      await kid.page.locator('.birthday-row', { hasText: 'סבתא רחל' }).waitFor({ timeout: 10000 });
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.locator('.tile', { hasText: 'יומן' }).getByText('יום הולדת לסבתא רחל').waitFor();
    }
    ok('Dad added birthdays; they show in everyone\'s schedule and home screen, and export as yearly events');

    step('Checklists');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await dad.page.locator('.lists-tile').click();
    const lists = dad.page.locator('.lists-page');
    await addNew(lists, 'רשימה חדשה');
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
    // Rename, lock, delete… live in the "⋮" options menu.
    const menu = async (scope, item) => {
      await scope.getByRole('button', { name: 'אפשרויות' }).click();
      await scope.getByRole('dialog', { name: /^אפשרויות/ }).getByRole('button', { name: item }).click();
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
    assert.ok(sent.startsWith('🏕️'), `WhatsApp keeps an emoji for the icon: ${sent.slice(0, 20)}`);
    await lists.getByRole('button', { name: 'אפשרויות' }).click();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/list-menu.png` });
    await lists.getByRole('dialog', { name: /^אפשרויות/ }).getByRole('button', { name: 'החלפת הסמל' }).click();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/icon-picker.png` });
    await lists.getByRole('group', { name: 'סמל' }).getByRole('button', { name: 'מזוודה' }).click();
    await lists.getByRole('button', { name: 'החלפת הסמל' }).click();
    await lists.getByRole('group', { name: 'סמל' }).getByRole('button', { name: 'מזוודה', pressed: true }).waitFor();
    await lists.getByRole('button', { name: 'סגירה' }).click();
    await lists.getByRole('button', { name: '→ כל הרשימות' }).click();
    await lists.locator('.list-card', { hasText: 'ציוד לטיול' }).getByText('1 מתוך 7').waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/lists.png` });
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.locator('.lists-tile').click();
    await kid.page.locator('.lists-page .list-card', { hasText: 'ציוד לטיול' }).click();
    const kidLists = kid.page.locator('.lists-page');
    await kidLists.locator('.entry.checked', { hasText: 'אוהל' }).waitFor({ timeout: 10000 });
    await menu(kidLists, 'ניקוי סימונים');
    await kidLists.getByText('0 מתוך 7 מסומנים').waitFor();
    await kidLists.getByRole('button', { name: '→ כל הרשימות' }).click();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'פתקים' }).click();
    await kidLists.locator('.list-card', { hasText: 'ציוד לטיול' }).waitFor();
    // Drag to reorder: a second list sorts first by name; Dad drags the trip list above it.
    await addNew(lists, 'רשימה חדשה');
    await lists.getByLabel('שם הרשימה').fill('אאא לבדיקה');
    await lists.getByRole('button', { name: 'יצירת הרשימה' }).click();
    // "סיום" adds what's still typed (no Enter) and closes the list.
    await lists.getByLabel('הוספת שורות').fill('פנס');
    await lists.getByRole('button', { name: 'סיום', exact: true }).click();
    await lists.locator('.list-card', { hasText: 'אאא לבדיקה' }).getByText('0 מתוך 1').waitFor({ timeout: 10000 });
    const titles = (page) => page.locator('.lists-page .list-card strong').allInnerTexts();
    assert.deepEqual((await titles(dad.page)).slice(0, 2), ['אאא לבדיקה', 'ציוד לטיול']);
    // A quick tap still opens a list; holding it lifts it, and dragging moves it.
    const dragCard = async (title, overTitle) => {
      const from = await lists.locator('.list-card', { hasText: title }).boundingBox();
      const to = await lists.locator('.list-card', { hasText: overTitle }).boundingBox();
      const x = from.x + from.width / 2;
      await dad.page.mouse.move(x, from.y + from.height / 2);
      await dad.page.mouse.down();
      await dad.page.waitForTimeout(600);
      for (let i = 1; i <= 8; i++) await dad.page.mouse.move(x, from.y + from.height / 2 + ((to.y - from.y - 24) * i) / 8);
      if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/lists-drag.png` });
      await dad.page.mouse.up();
    };
    await dragCard('ציוד לטיול', 'אאא לבדיקה');
    await dad.page.waitForFunction(() => document.querySelector('.lists-page .list-card strong')?.textContent?.includes('ציוד לטיול'));
    await kid.page.waitForFunction(() => document.querySelector('.lists-page .list-card strong')?.textContent?.includes('ציוד לטיול'), null, { timeout: 10000 });
    assert.equal(await lists.getByRole('button', { name: '→ כל הרשימות' }).count(), 0, 'letting go after a drag does not open the list');
    ok('holding a list and dragging it moves it up, for the whole family; letting go does not open it');
    // Edit mode: a grip on each row and a delete button; a tap renames.
    await lists.getByRole('button', { name: 'עריכה' }).click();
    await lists.getByRole('button', { name: 'גרירה לשינוי הסדר: אאא לבדיקה' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/library-edit.png` });
    await answer('אאא למחיקה', () => lists.locator('.list-card', { hasText: 'אאא לבדיקה' }).click());
    await lists.locator('.list-card', { hasText: 'אאא למחיקה' }).waitFor();
    await lists.getByRole('button', { name: 'סיום' }).click();
    // Swiping a row left shows share and delete.
    {
      const box = await lists.locator('.list-card', { hasText: 'אאא למחיקה' }).boundingBox();
      const y = box.y + box.height / 2;
      await dad.page.mouse.move(box.x + box.width - 30, y);
      await dad.page.mouse.down();
      for (let i = 1; i <= 8; i++) await dad.page.mouse.move(box.x + box.width - 30 - i * 25, y);
      await dad.page.mouse.up();
    }
    await lists.getByRole('button', { name: 'שיתוף' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/library-swipe.png` });
    await lists.getByRole('button', { name: 'מחיקה', exact: true }).click();
    await dad.page.getByRole('alertdialog', { name: 'למחוק את הרשימה "אאא למחיקה"?' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/confirm-delete.png` });
    await dad.page.getByRole('alertdialog').getByRole('button', { name: 'כן, למחוק' }).click();
    await lists.locator('.list-card', { hasText: 'אאא למחיקה' }).waitFor({ state: 'detached' });
    assert.equal(await lists.getByRole('button', { name: '→ כל הרשימות' }).count(), 0, 'swiping does not open the list');
    ok('the library: edit mode renames, a left swipe shows share and delete');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-lists.png`, fullPage: true });
    ok('Dad made a trip packing list with categories; the daughter opens it from home and from the bottom bar, and resets the ticks');

    step('Notes');
    await dad.page.getByRole('navigation').getByRole('button', { name: 'פתקים' }).click();
    await answer('בית', () => addNew(lists, 'תיקייה חדשה'));
    await lists.locator('.folder-card', { hasText: 'בית' }).click();
    await answer('ביטוחים', () => addNew(lists, 'תיקייה חדשה'));
    await lists.locator('.folder-card', { hasText: 'ביטוחים' }).click();
    await lists.getByRole('navigation', { name: 'מיקום במחברת' }).getByText('ביטוחים').waitFor();
    assert.ok((await lists.getByRole('navigation', { name: 'מיקום במחברת' }).innerText()).includes('בית'), 'path shows the parent folder');
    await lists.getByRole('button', { name: '→ בית' }).click();
    await lists.locator('.folder-card', { hasText: 'ביטוחים' }).waitFor();
    await addNew(lists, 'פתק חדש');
    await lists.getByLabel('שם הפתק').fill('קודים לבית');
    await lists.getByRole('button', { name: 'יצירת הפתק' }).click();
    await lists.getByLabel('תוכן הפתק').fill('שער חניה: 1234\nאזעקה: 9876');
    await lists.getByText('פתק משפחתי, כולם יכולים לערוך').waitFor();
    // Renaming: a long name shows whole (wraps), the cursor starts at the end, Enter saves.
    await lists.getByRole('button', { name: 'שינוי שם הפתק' }).click();
    const nameField = lists.getByLabel('שם הפתק');
    await nameField.fill('קודים לבית ולמחסן ולחניה של הבניין');
    assert.ok(await nameField.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'the whole long name is visible');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-rename.png` });
    await nameField.fill('קודים לבית');
    await nameField.press('Enter');
    await lists.getByRole('button', { name: 'שינוי שם הפתק' }).waitFor();
    assert.equal(await lists.locator('.list-title').innerText(), 'קודים לבית');
    ok('renaming a note shows the whole name and saves with Enter');
    await lists.getByLabel('בחירת קובץ לפתק').setInputFiles([`${process.env.TMPDIR || '/tmp'}/timetable-e2e.pdf`, 'public/icon-pink-512.png']);
    await lists.locator('.note-file').nth(1).waitFor({ timeout: 20000 });
    await menu(lists, 'נעיצה למעלה');
    await lists.getByText('📌 נעוץ', { exact: false }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-detail.png`, fullPage: true });
    await lists.getByRole('button', { name: 'הגדלת timetable-e2e.pdf' }).click();
    const closeZoom = dad.page.getByRole('button', { name: 'סגירה', exact: true });
    await closeZoom.waitFor();
    await dad.page.keyboard.press('Escape');
    await closeZoom.waitFor({ state: 'detached' });
    await lists.getByRole('button', { name: '→ בית' }).click();
    await lists.locator('.note-card', { hasText: 'קודים לבית' }).getByText('שער חניה: 1234').waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/notebook-folder.png` });
    await lists.getByRole('button', { name: '→ כל הפתקים' }).click();
    await lists.getByLabel('חיפוש בפתקים').fill('אזעקה');
    await lists.locator('.note-card', { hasText: 'קודים לבית' }).getByText('📁 בית').waitFor();
    await lists.getByLabel('חיפוש בפתקים').fill('');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/notes-tab.png` });
    await lists.locator('.list-card', { hasText: 'ציוד לטיול' }).waitFor();
    assert.equal(await lists.locator('.list-card', { hasText: 'קודים לבית' }).count(), 0, 'notes stay out of the lists tab');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'פתקים' }).click();
    await kidLists.locator('.folder-card', { hasText: 'בית' }).click();
    await kidLists.locator('.note-card', { hasText: 'קודים לבית' }).click();
    await kidLists.locator('.note-file').nth(1).waitFor({ timeout: 10000 });
    assert.equal(await kidLists.getByLabel('תוכן הפתק').inputValue(), 'שער חניה: 1234\nאזעקה: 9876');
    await kidLists.getByLabel('תוכן הפתק').fill('שער חניה: 1234\nאזעקה: 9876\nוויפי: levi2024');
    await kidLists.getByLabel('תוכן הפתק').blur();
    await kidLists.getByRole('button', { name: 'אפשרויות' }).click();
    await kidLists.getByRole('dialog', { name: /^אפשרויות/ }).getByRole('button', { name: 'העברה לתיקייה' }).click();
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-move.png` });
    await kidLists.getByRole('dialog', { name: /^העברה לתיקייה/ }).getByRole('button', { name: 'בית › ביטוחים' }).click();
    await lists.locator('.folder-card', { hasText: 'בית' }).click();
    await lists.locator('.folder-card', { hasText: 'ביטוחים' }).getByText('פתק אחד').waitFor({ timeout: 10000 });
    await lists.locator('.folder-card', { hasText: 'ביטוחים' }).click();
    await lists.locator('.note-card', { hasText: 'קודים לבית' }).click();
    await dad.page.waitForFunction(() => document.querySelector('.note-body')?.value.includes('וויפי'), null, { timeout: 10000 });
    // Formatting: the buttons add WhatsApp-style marks; out of editing the note shows formatted, and checkboxes tick.
    {
      const bodyBox = lists.getByLabel('תוכן הפתק', { exact: true });
      const before = await bodyBox.inputValue();
      await bodyBox.fill('# קודים\nשער חניה: 1234\n[ ] להחליף סוללה');
      await bodyBox.evaluate((el) => { const i = el.value.indexOf('1234'); el.setSelectionRange(i, i + 4); });
      await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).getByRole('button', { name: 'מודגש' }).click();
      assert.equal(await bodyBox.inputValue(), '# קודים\nשער חניה: *1234*\n[ ] להחליף סוללה');
      await bodyBox.blur();
      const view = lists.getByRole('button', { name: 'עריכת תוכן הפתק' });
      await view.locator('strong', { hasText: '1234' }).waitFor();
      await view.locator('.nf-h1', { hasText: 'קודים' }).waitFor();
      if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-format.png` });
      await view.getByRole('checkbox', { name: 'להחליף סוללה' }).click();
      await view.locator('[role="checkbox"][aria-checked="true"]').waitFor();
      assert.ok((await bodyBox.inputValue()).endsWith('[x] להחליף סוללה'), 'ticking the box changes the text');
      // Selecting a bold word on the formatted view (no editing) shows the buttons; bold again takes the bold off.
      // The selection wraps the bold element itself, as an iPhone makes it for a whole formatted word.
      await view.locator('strong', { hasText: '1234' }).evaluate((el) => {
        const r = document.createRange();
        r.selectNode(el);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      });
      // Above the note, not under it, where a long note would push it out of sight.
      const barBottom = await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).evaluate((el) => el.getBoundingClientRect().bottom);
      assert.ok(barBottom <= (await view.evaluate((el) => el.getBoundingClientRect().top)), 'the buttons sit above the note');
      await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).getByRole('button', { name: 'מודגש' }).click();
      await dad.page.waitForFunction(() => document.querySelector('textarea.note-body')?.value.includes('חניה: 1234\n'));
      // The buttons go once used (on the selection change that follows the edit).
      await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).waitFor({ state: 'detached', timeout: 5000 });
      await view.locator('.nf-h1').click();
      await bodyBox.evaluate((el) => document.activeElement === el);
      await dad.page.waitForTimeout(300);
      assert.equal(await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).count(), 0, 'no buttons while just typing');
      await bodyBox.evaluate((el) => { const i = el.value.indexOf('קודים'); el.setSelectionRange(i, i + 5); });
      await lists.getByRole('toolbar', { name: 'עיצוב טקסט' }).waitFor();
      if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-format-edit.png` });
      // With a phone keyboard open (simulated: the visible area shrinks by 300px) the bar sits right on top of it.
      const kbTop = await dad.page.evaluate(() => {
        const vv = window.visualViewport;
        const h = window.innerHeight - 300;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
        vv.dispatchEvent(new Event('resize'));
        return h;
      });
      const onKb = dad.page.locator('.format-bar.on-keyboard');
      await onKb.waitFor();
      const box = await onKb.boundingBox();
      assert.ok(Math.abs(box.y + box.height - kbTop) <= 1, `bar bottom ${box.y + box.height} at the keyboard top ${kbTop}`);
      if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-format-keyboard.png` });
      await onKb.getByRole('button', { name: 'מודגש' }).click();
      assert.equal(await lists.getByLabel('תוכן הפתק', { exact: true }).evaluate((el) => document.activeElement === el), true, 'the text box keeps the keyboard');
      await dad.page.evaluate(() => {
        delete window.visualViewport.height;
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
      await onKb.waitFor({ state: 'detached' });
      await bodyBox.fill(before);
      await bodyBox.blur();
      await dad.page.waitForTimeout(1200);
      ok('note formatting: buttons add marks, the note shows formatted, checkboxes tick');
    }
    await lists.getByRole('button', { name: 'מחיקת icon-pink-512.png' }).click();
    await lists.locator('.note-file').nth(1).waitFor({ state: 'detached' });
    await lists.getByRole('button', { name: '→ ביטוחים' }).click();
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await lists.locator('.folder-card', { hasText: 'בית' }).waitFor();
    await dad.page.reload();
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await kidLists.getByRole('button', { name: '→ ביטוחים' }).click();
    await kid.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    ok('Dad made folders and a pinned note with a PDF and a photo; search finds it; the daughter edits it and moves it to a sub-folder');

    step('Private notes');
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await addNew(lists, 'פתק חדש');
    await lists.getByLabel('שם הפתק').fill('תעודות זהות');
    await lists.getByRole('button', { name: 'יצירת הפתק' }).click();
    await lists.getByLabel('תוכן הפתק').fill('אבא: 012345678');
    await lists.getByLabel('בחירת קובץ לפתק').setInputFiles('public/icon-pink-512.png');
    await lists.locator('.note-file').first().waitFor({ timeout: 20000 });
    await lists.getByLabel('תוכן הפתק').blur();
    await lists.locator('.who-sees').getByText('כל המשפחה').waitFor();
    await lists.locator('.who-sees').getByRole('button', { name: 'שינוי' }).click();
    await lists.getByRole('button', { name: 'רק מי שאבחר' }).click();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-who-sees.png` });
    await lists.locator('.who-edit').getByRole('button', { name: 'שמירה' }).click();
    await lists.getByText('פתק פרטי').waitFor({ timeout: 10000 });
    await lists.locator('.who-sees').getByText('רק אני').waitFor();
    await lists.locator('.note-file').first().waitFor({ timeout: 10000 });
    assert.equal(await lists.getByLabel('תוכן הפתק').inputValue(), 'אבא: 012345678');
    await kid.page.reload();
    await kid.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await kidLists.getByLabel('חיפוש בפתקים').fill('זהות');
    await kidLists.getByText(`לא נמצא כלום עם "זהות".`).waitFor();
    await lists.locator('.who-sees').getByRole('button', { name: 'שינוי' }).click();
    await lists.locator('.who-edit').getByRole('button', { name: 'kid' }).click();
    await lists.locator('.who-edit').getByRole('button', { name: 'שמירה' }).click();
    await lists.locator('.who-sees').getByText('אני, kid').waitFor({ timeout: 10000 });
    await kidLists.locator('.note-card', { hasText: 'תעודות זהות' }).click({ timeout: 10000 });
    await kidLists.locator('.note-file').first().waitFor({ timeout: 10000 });
    await kidLists.locator('.who-sees').getByText(/יכול לשנות/).waitFor();
    assert.equal(await kidLists.locator('.who-sees').getByRole('button', { name: 'שינוי' }).count(), 0, 'only the creator can change who sees');
    await kidLists.getByRole('button', { name: '→ כל הפתקים' }).click();
    await lists.locator('.who-sees').getByRole('button', { name: 'שינוי' }).click();
    await lists.locator('.who-edit').getByRole('button', { name: 'כל המשפחה' }).click();
    await lists.locator('.who-edit').getByRole('button', { name: 'שמירה' }).click();
    await lists.getByText('פתק משפחתי, כולם יכולים לערוך').waitFor({ timeout: 10000 });
    await lists.locator('.note-file').first().waitFor({ timeout: 10000 });
    await menu(lists, 'מחיקת הפתק');
    await dad.page.getByRole('alertdialog').getByRole('button', { name: 'כן, למחוק' }).click();
    await lists.getByRole('button', { name: 'הוספה', exact: true }).waitFor();
    await kidLists.getByLabel('חיפוש בפתקים').fill('');
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'בית' }).click();
    ok('Dad made a private note the daughter cannot see, shared it with her (she cannot change who sees it), then made it a family note again');

    step('Password-locked notes');
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await addNew(lists, 'פתק חדש');
    await lists.getByLabel('שם הפתק').fill('קוד אזעקה');
    await lists.getByRole('button', { name: 'יצירת הפתק' }).click();
    await lists.getByLabel('תוכן הפתק').fill('אזעקה: 9876');
    await lists.getByLabel('בחירת קובץ לפתק').setInputFiles('public/icon-pink-512.png');
    await lists.locator('.note-file img').first().waitFor({ timeout: 20000 });
    await lists.getByLabel('תוכן הפתק').blur();
    await menu(lists, 'נעילה בסיסמה');
    await lists.getByLabel('סיסמה חדשה').fill('levi1234');
    await lists.getByLabel('אימות הסיסמה').fill('levi1234');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-lock.png` });
    await lists.locator('.note-lock').getByRole('button', { name: 'נעילה' }).click();
    await lists.getByText('נעול בסיסמה, פתוח כרגע').waitFor({ timeout: 15000 });
    await lists.locator('.note-file img').first().waitFor({ timeout: 15000 });
    assert.equal(await lists.getByLabel('תוכן הפתק').inputValue(), 'אזעקה: 9876');
    await lists.getByLabel('תוכן הפתק').fill('אזעקה: 9876\nכספת: 4321');
    await lists.getByLabel('תוכן הפתק').blur();
    await dad.page.waitForTimeout(1500);
    // On the server: only ciphertext, for the text and the file.
    const rest = async (path) => (await fetch(`http://127.0.0.1:8080/v1/projects/demo-family/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();
    const fams = (await rest('families')).documents ?? [];
    let stored = null;
    let storedFiles = [];
    for (const f of fams) {
      const fid = f.name.split('/').pop();
      const docs = (await rest(`families/${fid}/lists?pageSize=300`)).documents ?? [];
      const hit = docs.find((d) => d.fields?.title?.stringValue === 'קוד אזעקה');
      if (hit) {
        stored = hit.fields;
        const id = hit.name.split('/').pop();
        storedFiles = ((await rest(`families/${fid}/noteFiles?pageSize=300`)).documents ?? []).filter((d) => d.fields.noteId.stringValue === id).map((d) => d.fields);
      }
    }
    assert.ok(stored, 'locked note found on the server');
    assert.equal(stored.locked.booleanValue, true);
    assert.ok(!stored.body.stringValue.includes('9876') && !stored.body.stringValue.includes('4321'), `server holds no plain text: ${stored.body.stringValue}`);
    assert.equal(storedFiles.length, 1, 'one file');
    assert.ok(storedFiles[0].secret && !storedFiles[0].image, 'the file is stored encrypted');
    // Open with its password, a locked note can be shared, after one more question.
    await dad.page.evaluate(() => { window.__shared = null; window.open = (url) => { window.__shared = String(url); return null; }; });
    await menu(lists, 'שיתוף בווטסאפ');
    const shareAsk = dad.page.getByRole('alertdialog', { name: 'הפתק נעול, לשתף בכל זאת?' });
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/locked-share.png` });
    await shareAsk.getByRole('button', { name: 'ביטול' }).click();
    assert.equal(await dad.page.evaluate(() => window.__shared), null, 'cancel shares nothing');
    await menu(lists, 'שיתוף בווטסאפ');
    await shareAsk.getByRole('button', { name: 'כן, לשתף' }).click();
    await dad.page.waitForFunction(() => window.__shared);
    assert.match(decodeURIComponent(await dad.page.evaluate(() => window.__shared)), /כספת: 4321/);
    ok('a locked note, once open, can be shared after a question');
    await menu(lists, 'נעילה עכשיו');
    await lists.getByLabel('סיסמת הפתק').waitFor();
    assert.equal(await lists.getByLabel('תוכן הפתק').count(), 0, 'locked: no text shown');
    await lists.getByRole('button', { name: '→ כל הפתקים' }).click();
    await lists.locator('.note-card', { hasText: 'קוד אזעקה' }).getByText('נעול בסיסמה').waitFor();
    // The daughter needs the password; a wrong one is refused.
    await kid.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await kidLists.locator('.note-card', { hasText: 'קוד אזעקה' }).click({ timeout: 10000 });
    await kidLists.getByLabel('סיסמת הפתק').fill('nope');
    await kidLists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await kidLists.getByText('הסיסמה לא נכונה').waitFor({ timeout: 10000 });
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/note-gate.png` });
    await kidLists.getByLabel('סיסמת הפתק').fill('levi1234');
    await kidLists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await kid.page.waitForFunction(() => document.querySelector('.note-body')?.value.includes('כספת: 4321'), null, { timeout: 15000 });
    await kidLists.locator('.note-file img').first().waitFor({ timeout: 15000 });
    await kidLists.getByRole('button', { name: 'אפשרויות' }).click();
    await kidLists.getByRole('dialog', { name: /^אפשרויות/ }).getByRole('button', { name: 'נעילה עכשיו' }).waitFor();
    assert.equal(await kidLists.getByRole('dialog').getByRole('button', { name: 'הסרת הסיסמה' }).count(), 0, 'only the creator removes the password');
    await kid.page.keyboard.press('Escape'); // the ⋮ menu closes like any popup menu
    await kidLists.getByRole('button', { name: '→ כל הפתקים' }).click();
    // Dad opens it again and removes the password.
    await lists.locator('.note-card', { hasText: 'קוד אזעקה' }).click();
    await lists.getByLabel('סיסמת הפתק').fill('levi1234');
    await lists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await menu(lists, 'הסרת הסיסמה');
    await lists.getByText('פתק משפחתי, כולם יכולים לערוך').waitFor({ timeout: 15000 });
    await lists.locator('.note-file img').first().waitFor({ timeout: 15000 });
    assert.equal(await lists.getByLabel('תוכן הפתק').inputValue(), 'אזעקה: 9876\nכספת: 4321');
    await menu(lists, 'מחיקת הפתק');
    await dad.page.getByRole('alertdialog').getByRole('button', { name: 'כן, למחוק' }).click();
    await lists.getByRole('button', { name: 'הוספה', exact: true }).waitFor();
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'בית' }).click();
    ok('Dad locked a note with a password: the server holds only ciphertext; the daughter opens it with the password; only Dad removes it');

    step('Password-locked folders');
    const serverNote = async (title) => {
      const rest = async (path) => (await fetch(`http://127.0.0.1:8080/v1/projects/demo-family/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();
      for (const f of (await rest('families')).documents ?? []) {
        const fid = f.name.split('/').pop();
        const hit = ((await rest(`families/${fid}/lists?pageSize=300`)).documents ?? []).find((d) => d.fields?.title?.stringValue === title);
        if (hit) return hit.fields;
      }
      return null;
    };
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await answer('מסמכים', () => addNew(lists, 'תיקייה חדשה'));
    await lists.locator('.folder-card', { hasText: 'מסמכים' }).click();
    await addNew(lists, 'פתק חדש');
    await lists.getByLabel('שם הפתק').fill('דרכון');
    await lists.getByRole('button', { name: 'יצירת הפתק' }).click();
    await lists.getByLabel('תוכן הפתק').fill('דרכון: 111');
    await lists.getByLabel('בחירת קובץ לפתק').setInputFiles('public/icon-pink-512.png');
    await lists.locator('.note-file img').first().waitFor({ timeout: 20000 });
    await lists.getByLabel('תוכן הפתק').blur();
    await lists.getByRole('button', { name: '→ מסמכים' }).click();
    await kid.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'פתקים' }).click();
    await kidLists.locator('.folder-card', { hasText: 'מסמכים' }).click({ timeout: 10000 });
    await addNew(kidLists, 'פתק חדש');
    await kidLists.getByLabel('שם הפתק').fill('של הבת');
    await kidLists.getByRole('button', { name: 'יצירת הפתק' }).click();
    await kidLists.getByLabel('תוכן הפתק').fill('הבת: 222');
    await kidLists.getByLabel('תוכן הפתק').blur();
    await kidLists.getByRole('button', { name: '→ מסמכים' }).click();
    await lists.locator('.note-card', { hasText: 'של הבת' }).getByText('הבת: 222').waitFor({ timeout: 10000 });
    // Dad locks the folder: both notes, the daughter's too, are encrypted.
    await menu(lists, 'נעילת התיקייה בסיסמה');
    await lists.getByLabel('סיסמה חדשה לתיקייה').fill('docs5678');
    await lists.getByLabel('אימות סיסמת התיקייה').fill('docs5678');
    await lists.locator('.note-lock').getByRole('button', { name: 'נעילה' }).click();
    await lists.locator('.note-card', { hasText: 'של הבת' }).getByText('נעול בסיסמה').waitFor({ timeout: 20000 });
    await lists.locator('.note-card', { hasText: 'דרכון' }).getByText('נעול בסיסמה').waitFor({ timeout: 20000 });
    await lists.getByRole('status').waitFor({ state: 'detached', timeout: 20000 });
    for (const [t, secret] of [['דרכון', '111'], ['של הבת', '222']]) {
      const n = await serverNote(t);
      assert.ok(n.locked.booleanValue && n.lockFolder.stringValue && !n.body.stringValue.includes(secret), `${t} is encrypted on the server`);
    }
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/folder-locked-open.png` });
    await menu(lists, 'נעילה עכשיו');
    await lists.getByLabel('סיסמת התיקייה').waitFor();
    assert.equal(await lists.locator('.note-card').count(), 0, 'a shut folder shows no notes');
    await lists.getByRole('button', { name: '→ כל הפתקים' }).click();
    await lists.locator('.folder-card', { hasText: 'מסמכים' }).getByLabel('נעולה').waitFor();
    // The daughter opens the folder with its password; her note opens with no extra password.
    await kidLists.getByLabel('סיסמת התיקייה').waitFor({ timeout: 10000 });
    await kidLists.getByLabel('סיסמת התיקייה').fill('wrong');
    await kidLists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await kidLists.getByText('הסיסמה לא נכונה').waitFor({ timeout: 10000 });
    if (process.env.SCREENSHOT_DIR) await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/folder-gate.png` });
    await kidLists.getByLabel('סיסמת התיקייה').fill('docs5678');
    await kidLists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await kidLists.locator('.note-card', { hasText: 'של הבת' }).click({ timeout: 10000 });
    await kid.page.waitForFunction(() => document.querySelector('.note-body')?.value === 'הבת: 222', null, { timeout: 15000 });
    await kidLists.getByText('בתיקייה נעולה, פתוח כרגע').waitFor();
    // Moving it out of the folder opens it up.
    await kidLists.getByRole('button', { name: 'אפשרויות' }).click();
    await kidLists.getByRole('dialog', { name: /^אפשרויות/ }).getByRole('button', { name: 'העברה לתיקייה' }).click();
    await kidLists.getByRole('dialog', { name: /^העברה לתיקייה/ }).getByRole('button', { name: 'בלי תיקייה (ראשי)' }).click();
    await kidLists.getByText('פתק משפחתי, כולם יכולים לערוך').waitFor({ timeout: 15000 });
    await kid.page.waitForTimeout(1000);
    const out = await serverNote('של הבת');
    assert.ok(!out.locked.booleanValue && out.body.stringValue === 'הבת: 222', 'moved out: plain again');
    await kidLists.getByRole('button', { name: '→ כל הפתקים' }).click();
    // Dad opens the folder and removes its password.
    await lists.locator('.folder-card', { hasText: 'מסמכים' }).click();
    await lists.getByLabel('סיסמת התיקייה').fill('docs5678');
    await lists.getByRole('button', { name: 'פתיחה', exact: true }).click();
    await menu(lists, 'הסרת הסיסמה');
    await lists.locator('.note-card', { hasText: 'דרכון' }).getByText('דרכון: 111').waitFor({ timeout: 20000 });
    await lists.getByRole('button', { name: 'אפשרויות' }).click();
    await lists.getByRole('dialog').getByRole('button', { name: 'נעילת התיקייה בסיסמה' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/folder-menu.png` });
    await dad.page.keyboard.press('Escape');
    await lists.getByRole('button', { name: '→ כל הפתקים' }).click();
    await dad.page.getByRole('navigation', { name: 'ניווט' }).getByRole('button', { name: 'בית' }).click();
    ok('Dad locked a folder: his note and the daughter\'s are encrypted; she opens the folder with its password, moves her note out (plain again); Dad removes the password');

    await planner(dad.page, 'schedule');
    await upcomingView(dad.page);
    await calMenu(dad.page, 'הוספה', 'אירוע חדש');
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('חוג ציור');
    await dad.page.locator('input[type=time]').fill('17:30');
    await dad.page.getByRole('group', { name: 'מי משתתף' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    await kid.page.reload();
    await planner(kid.page, 'schedule');
    await kid.page.locator('.row', { hasText: 'חוג ציור' }).getByText('17:30').waitFor({ timeout: 10000 });
    ok('event added by Dad appears in the daughter\'s calendar');
    await calMenu(dad.page, 'הוספה', 'אירוע חדש');
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('טיול שנתי');
    await dad.page.getByLabel('כמה ימים').check();
    const dayLabelFor = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
    const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    await dad.page.getByLabel('מתאריך').fill(iso(1));
    await dad.page.getByLabel('עד תאריך').fill(iso(3));
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    await dad.page.locator('.row', { hasText: 'טיול שנתי' }).locator('.until').waitFor();
    ok('multi-day event saved with an end date');
    await calMenu(dad.page, 'הוספה', 'אירוע חדש');
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
    await calMenu(dad.page, 'הוספה', 'משימה ליומן');
    await dad.page.getByPlaceholder('למשל: לקנות מתנה לסבתא').fill('לקנות מתנה');
    await dad.page.getByRole('dialog').getByRole('button', { name: 'kid' }).click();
    await dad.page.getByRole('dialog').getByRole('button', { name: 'הוספה' }).click();
    await dad.page.locator('.month .row', { hasText: 'לקנות מתנה' }).getByText('kid').waitFor();
    await dad.page.locator('.month-grid .day.today .mark.tk').waitFor();
    await kid.page.locator('.row', { hasText: 'לקנות מתנה' }).waitFor({ timeout: 10000 });
    ok('month view marks today; a task added on a calendar day shows there and in the daughter\'s calendar');
    // The ⋮ menu opens as a small card at the top right, with quick lists of events and tasks.
    await dad.page.getByRole('button', { name: 'אפשרויות', exact: true }).click();
    const calMore = dad.page.getByRole('dialog', { name: /^אפשרויות/ });
    const box = await calMore.boundingBox();
    const pageW = dad.page.viewportSize().width;
    assert.ok(box.y < 200 && box.x + box.width > pageW - 20, `menu at the top right: ${JSON.stringify(box)}`);
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/calendar-menu.png` });
    await calMore.getByRole('button', { name: 'אירועים קרובים' }).click();
    const evSheet = dad.page.getByRole('dialog', { name: 'אירועים קרובים' });
    await evSheet.locator('.row', { hasText: 'טיול שנתי' }).waitFor();
    await evSheet.locator('.row', { hasText: 'שיעור פרטי' }).first().waitFor();
    assert.equal(await evSheet.locator('.row', { hasText: 'לקנות מתנה' }).count(), 0, 'no tasks in the events list');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/calendar-events.png` });
    await evSheet.getByRole('button', { name: 'סגירה' }).click();
    await calMenu(dad.page, 'אפשרויות', 'משימות');
    const taskSheet = dad.page.getByRole('dialog', { name: 'משימות' });
    await taskSheet.locator('.row', { hasText: 'לקנות מתנה' }).getByText('kid').waitFor();
    assert.equal(await taskSheet.locator('.row', { hasText: 'טיול שנתי' }).count(), 0, 'no events in the tasks list');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/calendar-tasks.png` });
    await taskSheet.getByRole('button', { name: 'סגירה' }).click();
    ok('the calendar ⋮ menu opens at the top right and lists upcoming events and open tasks separately');
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/calendar-month.png` });
    if (process.env.SCREENSHOT_DIR) {
      await kid.page.getByRole('navigation').getByRole('button', { name: 'בית' }).click();
      await kid.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home.png` });
    }

    step('Removed member loses access');
    await dad.page.getByLabel('הגדרות').click();
    // Long names stay on one line: rename and remove live in each person's ⋮ menu.
    await dad.page.locator('.person', { hasText: 'kid' }).getByRole('button', { name: 'אפשרויות' }).click();
    await dad.page.getByRole('dialog', { name: 'אפשרויות: kid' }).getByRole('button', { name: 'שינוי שם' }).waitFor();
    if (process.env.SCREENSHOT_DIR) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/member-menu.png` });
    await dad.page.getByRole('dialog', { name: 'אפשרויות: kid' }).getByRole('button', { name: 'הסרה מהמשפחה' }).click();
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
      for (const [label, file] of [['צהוב ושחור', 'list-gold.png'], ['ירוק ולבן', 'list-green.png'], ['לבן וזהב', 'list-goldlight.png'], ['כתום ולבן', 'list-orange.png'], ['ורוד ולבן', null]]) {
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
        if (file) {
          // The top of the list: the logo and the WhatsApp button take the palette's colour.
          await dad.page.evaluate(() => window.scrollTo(0, 0));
          await dad.page.waitForTimeout(300);
          await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/top-${file}` });
        }
      }
      await planner(dad.page, 'tasks');
      await dad.page.getByRole('button', { name: 'רק שלי' }).waitFor();
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
