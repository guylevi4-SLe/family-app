import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { readTimetable } = createRequire(import.meta.url)('./readSchedule.js');

let sent;
const client = { messages: { create: async (req) => { sent = req; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ day0: 'חשבון\nאנגלית', day1: '', day2: ' מדעים ', day3: '', day4: '', day5: '' }) }] }; } } };
const days = await readTimetable(client, 'data:image/jpeg;base64,/9j/AAA=');
assert.deepEqual(days, ['חשבון\nאנגלית', '', 'מדעים', '', '', '']);
assert.equal(sent.model, 'claude-haiku-5-5');
assert.equal(sent.messages[0].content[0].source.data, '/9j/AAA=');
assert.equal(sent.output_config.format.type, 'json_schema');
await assert.rejects(readTimetable(client, 'data:text/html;base64,AAA='));
const refused = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
await assert.rejects(readTimetable(refused, 'data:image/jpeg;base64,/9j/AAA='));
console.log('readTimetable ok');
