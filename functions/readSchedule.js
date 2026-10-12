'use strict';
// Reads a timetable image with Claude and returns the lessons for Sunday…Friday,
// one string per day with one lesson per line.

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

const PROMPT = `This is an Israeli school weekly timetable (מערכת שעות), usually in Hebrew, read right to left.
For each school day from Sunday (ראשון) to Friday (שישי), list that day's lessons in order, one per line.
Start a line with the lesson's hour or number when the timetable shows one (for example "8:00 מתמטיקה" or "1. מתמטיקה").
Keep subject names exactly as written, and add a teacher or room only when it is written next to the subject.
Leave a day empty when it has no lessons. Do not invent lessons that are not in the image.`;

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(DAYS.map((d, i) => [`day${i}`, { type: 'string', description: `יום ${d}` }])),
  required: DAYS.map((_, i) => `day${i}`),
  additionalProperties: false,
};

async function readTimetable(client, imageDataUrl) {
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(imageDataUrl || '');
  if (!m) throw new Error('not a JPEG data URL');
  const response = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: m[1] } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`stopped: ${response.stop_reason}`);
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const parsed = JSON.parse(text);
  return DAYS.map((_, i) => String(parsed[`day${i}`] ?? '').trim().slice(0, 1000));
}

module.exports = { readTimetable };
