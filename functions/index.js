'use strict';
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { TARGET_COLLECTION, recipients, message, link } = require('./notify');
const { readTimetable } = require('./readSchedule');

admin.initializeApp();
const db = admin.firestore();

// When a comment names people to notify, push it to their phones.
exports.notifyOnComment = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 30 })
  .firestore.document('families/{fid}/comments/{cid}')
  .onCreate(async (snap, ctx) => {
    const comment = snap.data();
    if (!Array.isArray(comment.notify) || comment.notify.length === 0) return;
    const { fid } = ctx.params;
    const family = db.collection('families').doc(fid);

    const members = await family.collection('members').get();
    const ids = members.docs.map((d) => d.id);
    if (!ids.includes(comment.authorUid)) return; // rules already enforce this
    const to = recipients(comment, ids);
    if (to.length === 0) return;

    let targetTitle = '';
    const col = TARGET_COLLECTION[comment.targetType];
    if (col) {
      const target = await family.collection(col).doc(String(comment.targetId)).get();
      targetTitle = target.get('name') || target.get('title') || '';
    }
    const { title, body } = message(comment, targetTitle);

    const devices = (await Promise.all(to.map((uid) => db.collection('users').doc(uid).collection('devices').get())))
      .flatMap((q) => q.docs);
    const tokens = devices.map((d) => d.get('token')).filter(Boolean);
    if (tokens.length === 0) return;

    // Data-only message: the app's service worker shows it (required on iPhone).
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title, body, url: link(comment), tag: `${comment.targetType}:${comment.targetId}` },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } },
    });

    // Forget phones that uninstalled the app or turned notifications off.
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || '') ? devices[i].ref : null))
      .filter(Boolean);
    await Promise.all(dead.map((ref) => ref.delete()));
  });

// When a new timetable image is uploaded, Claude reads it into lessons per day.
// The app shows them as a suggestion that a parent checks before saving.
// Runs only when ANTHROPIC_API_KEY is configured (functions/.env, written by the deploy).
exports.readScheduleOnUpload = functions
  .region('europe-west1')
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .firestore.document('families/{fid}/schedules/{uid}')
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after || !after.image) return;
    if (change.before.exists && change.before.get('image') === after.image) return;
    if (!process.env.ANTHROPIC_API_KEY) return;
    const ref = change.after.ref;
    const stillSame = async () => (await ref.get()).get('image') === after.image;
    await ref.update({ readStatus: 'reading' });
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const days = await readTimetable(new Anthropic(), after.image);
      if (await stillSame()) await ref.update({ suggested: days, readStatus: 'done' });
    } catch (err) {
      console.error('reading the timetable failed', err);
      if (await stillSame()) await ref.update({ readStatus: 'failed' });
    }
  });
