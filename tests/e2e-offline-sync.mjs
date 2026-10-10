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
    await dad.page.getByRole('button', { name: 'משימות' }).click();
    await dad.page.getByLabel('משימה חדשה').fill('לתלות כביסה');
    await dad.page.getByRole('group', { name: 'אחראי' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByLabel('הוספת משימה').click();
    await kid.page.locator('.tile', { hasText: 'משימות' }).getByText('1 שלך: לתלות כביסה').waitFor({ timeout: 10000 });
    ok('task assigned by Dad shows on the daughter\'s home screen as hers');
    await kid.page.getByRole('navigation').getByRole('button', { name: 'משימות' }).click();
    await kid.page.locator('.row', { hasText: 'לתלות כביסה' }).getByRole('button', { name: /עריכת/ }).click();
    await kid.page.getByRole('dialog').getByRole('button', { name: /תגוב/ }).click();
    await kid.page.getByLabel('כתיבת תגובה').fill('אבל עשיתי אתמול!');
    await kid.page.getByLabel('כתיבת תגובה').press('Enter');
    await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).locator('.comment-chip', { hasText: '1' }).waitFor({ timeout: 10000 });
    await dad.page.locator('.row', { hasText: 'לתלות כביסה' }).locator('.comment-chip').click();
    await dad.page.getByText('אבל עשיתי אתמול!').waitFor();
    ok('daughter commented on the task; Dad sees the comment count and the text');
    await dad.page.getByLabel('סגירה').click();
    await kid.page.getByLabel('סגירה').click();
    await kid.page.keyboard.press('Escape');

    await dad.page.getByRole('navigation').getByRole('button', { name: 'יומן' }).click();
    await dad.page.getByRole('button', { name: '+ אירוע חדש' }).click();
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('חוג ציור');
    await dad.page.locator('input[type=time]').fill('17:30');
    await dad.page.getByRole('group', { name: 'מי משתתף' }).getByRole('button', { name: 'kid' }).click();
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    await kid.page.reload();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'יומן' }).click();
    await kid.page.locator('.row', { hasText: 'חוג ציור' }).getByText('17:30').waitFor({ timeout: 10000 });
    ok('event added by Dad appears in the daughter\'s calendar');
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
      for (const [label, file] of [['לבן וזהב', 'list-goldlight.png'], ['ירוק (הקלאסי)', 'list-green.png'], ['שחור וזהב', null]]) {
        await dad.page.getByRole('button', { name: 'הגדרות' }).click();
        await dad.page.getByRole('dialog').getByRole('button', { name: label }).click();
        await dad.page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click();
        if (file) await dad.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${file}` });
      }
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
