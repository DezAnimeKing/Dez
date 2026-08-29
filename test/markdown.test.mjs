/* The markdown importer. These run the author's real conventions through it:
 * tagged headings, tagged paragraphs, front matter, and files with none of
 * that at all. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseBatch, slugify, extractWikiLinks } from '../js/markdown.js';
import { makePage } from '../js/schema.js';

const parse = (text, opts) => parseMarkdown(text, opts);

test('a plain document becomes a titled page of blocks', () => {
  const { page, stats } = parse(`# The Drowned Quarter

It sank in a single night, and the water never left.

## Ruling

Nobody rules it now.`, { filename: 'drowned-quarter.md', type: 'region' });

  assert.equal(page.title, 'The Drowned Quarter');
  assert.equal(page.type, 'region');
  assert.equal(page.status, 'PROPOSED', 'nothing becomes canon by being imported');
  assert.deepEqual(page.blocks.map((b) => b.kind), ['paragraph', 'heading', 'paragraph']);
  assert.equal(page.blocks[1].text, 'Ruling');
  assert.equal(page.blocks[1].anchor, 'ruling', 'headings get an anchor for [[Page#Heading]]');
  assert.equal(page.summary, 'It sank in a single night, and the water never left.');
  assert.equal(stats.headings, 1);
  assert.equal(stats.words, 16);
});

test('the H1 becomes the title and is not repeated as a block', () => {
  const { page } = parse('# Only A Title\n\nBody.');
  assert.equal(page.title, 'Only A Title');
  assert.equal(page.blocks.length, 1);
  assert.equal(page.blocks[0].text, 'Body.');
});

test('a file with no H1 falls back to its filename', () => {
  const { page } = parse('Just some prose.', { filename: 'the_second_vessel.md' });
  assert.equal(page.title, 'The Second Vessel');
});

/* ------------------------------------------------------------ status tags */

test('[OPEN] on a paragraph becomes that block\'s status and leaves the prose clean', () => {
  const { page, stats } = parse(`# Vessel

Settled fact.

[OPEN] Did she carry the memory, or only the wound?`);

  assert.equal(page.blocks[1].status, 'OPEN');
  assert.equal(page.blocks[1].text, 'Did she carry the memory, or only the wound?', 'the tag is stripped from the text');
  assert.equal(page.blocks[0].status, null, 'an untagged block inherits the page');
  assert.equal(stats.statusTags, 1);
  assert.deepEqual(stats.byStatus, { OPEN: 1 });
});

test('tags are recognised however they were written', () => {
  for (const written of ['[CANON]', '**[CANON]**', '[canon]', '_[Canon]_', '[ CANON ]']) {
    const { page } = parse(`# T\n\n${written} Settled.`);
    assert.equal(page.blocks[0].status, 'CANON', `${written} should be read as CANON`);
    assert.equal(page.blocks[0].text, 'Settled.');
  }
});

test('a tag on a heading rules its whole section', () => {
  const { page } = parse(`# Cosmology

## The Seven Modes [CANON]

Transmigration carries no memory.

Signature Recurrence carries no soul.

## Open Ground [OPEN]

What happens to a Composite when the vessel breaks?`);

  const [modes, a, b, ground, c] = page.blocks;
  assert.equal(modes.text, 'The Seven Modes', 'the tag is stripped from the heading');
  assert.equal(modes.status, 'CANON');
  assert.equal(a.status, 'CANON', 'the section rules the blocks under it');
  assert.equal(b.status, 'CANON');
  assert.equal(ground.status, 'OPEN');
  assert.equal(c.status, 'OPEN', 'and the next section rules its own');
});

test('a subsection inherits, a sibling section does not', () => {
  const { page } = parse(`# T

## Settled [CANON]

Under settled.

### Deeper

Still under settled.

## Elsewhere

Not under settled.`);

  const byText = Object.fromEntries(page.blocks.map((b) => [b.text, b.status]));
  assert.equal(byText['Under settled.'], 'CANON');
  assert.equal(byText['Still under settled.'], 'CANON', 'a deeper heading stays inside the section');
  assert.equal(byText['Not under settled.'], null, 'a sibling heading ends the section');
});

test('a block\'s own tag beats the section it sits in', () => {
  const { page } = parse(`# T

## Settled [CANON]

Settled prose.

[OPEN] Except this.`);
  assert.equal(page.blocks[2].status, 'OPEN');
});

test('a tag on the H1 sets the page status, and blocks under it merely inherit', () => {
  const { page } = parse(`# The Unhoming [CANON]

It happened. [CANON]

This part did not.  [OPEN]`);

  assert.equal(page.title, 'The Unhoming');
  assert.equal(page.status, 'CANON');
  assert.equal(page.blocks[0].status, 'CANON');
  assert.equal(page.blocks[1].status, 'OPEN');
});

test('[SOURCE] survives import as SOURCE, not as canon', () => {
  const { page } = parse('# Orpheus\n\n[SOURCE] In Ovid he looks back.');
  assert.equal(page.blocks[0].status, 'SOURCE');
});

/* ----------------------------------------------------------- front matter */

test('front matter sets what it names and warns about what it gets wrong', () => {
  const { page, warnings } = parse(`---
title: The First Vessel
type: character
status: CANON
tier: exercise
cast: principal
aliases: She Who Was Kept, The Understudy
tags: [vessel, soul]
music: A borrowed song
---

# Ignored Heading

Body.`, { type: 'system' });

  assert.equal(page.title, 'The First Vessel', 'front matter beats the H1');
  assert.equal(page.type, 'character', 'and beats the type chosen at import');
  assert.equal(page.status, 'CANON');
  assert.equal(page.devTier, 'exercise');
  assert.equal(page.castTier, 'principal');
  assert.deepEqual(page.aliases, ['She Who Was Kept', 'The Understudy']);
  assert.deepEqual(page.tags, ['vessel', 'soul']);
  assert.deepEqual(page.themeMusic, { title: 'A borrowed song', url: '' });
  assert.equal(warnings.length, 0);
  assert.equal(page.blocks[0].text, 'Ignored Heading', 'the H1 stays as a block when the title came from elsewhere');
});

test('front matter lists may be written as a yaml list', () => {
  const { page } = parse(`---
aliases:
  - The Understudy
  - She Who Was Kept
---
Body.`);
  assert.deepEqual(page.aliases, ['The Understudy', 'She Who Was Kept']);
});

test('a nonsense type or tier is reported, never silently stored', () => {
  const { page, warnings } = parse('---\ntype: monster\ntier: hidden\n---\nBody.', { type: 'system' });
  assert.equal(page.type, 'system');
  assert.equal(page.devTier, 'canon');
  assert.equal(warnings.length, 2);
  assert.match(warnings.join(' '), /monster/);
  assert.match(warnings.join(' '), /hidden/);
});

test('three dashes that are not front matter are left alone', () => {
  const { page } = parse('Body first.\n\n---\n\nMore body.');
  assert.equal(page.blocks.length, 2, 'a horizontal rule is not a block');
  assert.equal(page.blocks[0].text, 'Body first.');
});

/* ----------------------------------------------------------- block shapes */

test('lists, quotes, tables and code survive as their own blocks', () => {
  const { page } = parse(`# T

- one
- two

> A remembered line.

| mode | memory |
| --- | --- |
| Transmigration | none |

\`\`\`
raw
\`\`\`

Ordinary prose.`);

  assert.deepEqual(page.blocks.map((b) => b.kind), ['list', 'quote', 'table', 'code', 'paragraph']);
  assert.equal(page.blocks[0].text, '- one\n- two', 'a list stays one block, not two');
  assert.equal(page.blocks[1].text, 'A remembered line.', 'quote markers are stripped');
  assert.match(page.blocks[2].text, /Transmigration/);
});

test('a fenced block keeps its blank lines and markdown syntax', () => {
  const { page } = parse('# T\n\n```\nline one\n\n# not a heading\n```');
  assert.equal(page.blocks.length, 1);
  assert.match(page.blocks[0].text, /# not a heading/);
});

test('every parsed block is accepted by makePage', () => {
  const { page } = parse('# T\n\n## H [CANON]\n\nProse.\n\n- a list');
  const stored = makePage(page);
  assert.equal(stored.blocks.length, page.blocks.length);
  assert.equal(stored.blocks[0].anchor, 'h');
  assert.equal(stored.status, 'PROPOSED');
});

/* ------------------------------------------------------------- wiki links */

test('[[links]] are collected for stage three and left in the prose', () => {
  const { page, stats } = parse('# T\n\nShe met [[The Second Vessel]] at [[The Drowned Quarter#Ruling]].');
  assert.deepEqual(page.links, [
    { target: 'The Second Vessel', anchor: null },
    { target: 'The Drowned Quarter', anchor: 'Ruling' },
  ]);
  assert.match(page.blocks[0].text, /\[\[The Second Vessel\]\]/, 'the link text is left intact for the editor');
  assert.equal(stats.links, 2);
});

test('a link repeated twice is recorded once', () => {
  const { page } = parse('[[A]] and [[A]] again, plus [[A#b]].');
  assert.equal(page.links.length, 2);
});

test('extractWikiLinks handles the piped form', () => {
  assert.deepEqual(extractWikiLinks('[[The First Vessel|her]]'), [{ target: 'The First Vessel', anchor: null }]);
});

/* ------------------------------------------------------------------ batch */

test('a batch flags titles that collide with the world or each other', () => {
  const results = parseBatch([
    { filename: 'a.md', text: '# The First Vessel\n\nOne.' },
    { filename: 'b.md', text: '# The First Vessel\n\nTwo.' },
    { filename: 'c.md', text: '# Somewhere New\n\nThree.' },
  ], { type: 'character', existingTitles: ['The First Vessel'] });

  assert.deepEqual(results.map((r) => r.duplicate), [true, true, false]);
  assert.equal(results[2].filename, 'c.md');
});

test('an empty file is reported rather than imported silently', () => {
  const { page, warnings } = parse('   \n\n', { filename: 'empty.md' });
  assert.equal(page.blocks.length, 0);
  assert.equal(page.title, 'Empty');
  assert.match(warnings.join(' '), /No body content/);
});

test('slugs are stable and url-safe', () => {
  assert.equal(slugify('The Seven Modes'), 'the-seven-modes');
  assert.equal(slugify('Fall 666 — the Unhoming?'), 'fall-666-the-unhoming');
});
