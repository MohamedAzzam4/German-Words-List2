import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage links to the 80/20 words and chunks study app', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

  assert.match(html, /href="https:\/\/mohamedazzam4\.github\.io\/German-cards-temp\/"/);
  assert.match(html, />80\/20 Words &amp; Chunks</);
  assert.match(html, />40 Decks · 893 Cards</);
});
