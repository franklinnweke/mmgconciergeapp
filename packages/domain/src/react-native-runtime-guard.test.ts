import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MOBILE_SRC = path.resolve(__dirname, '../../../apps/mobile/src');

const DISALLOWED_HTML_TAGS = [
  'div',
  'span',
  'p',
  'button',
  'a',
  'input',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'nav',
  'section',
  'header',
  'footer',
  'main',
  'article',
  'aside',
  'select',
  'option',
  'table',
  'tr',
  'td',
  'th',
  'tbody',
  'thead',
  'label',
  'form',
];

function getAllTsxFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllTsxFiles(filePath));
    } else if (file.endsWith('.tsx')) {
      results.push(filePath);
    }
  }
  return results;
}

describe('React Native Runtime & JSX Guard', () => {
  const tsxFiles = getAllTsxFiles(MOBILE_SRC);

  it('guarantees that no raw web HTML tags are rendered in mobile JSX', () => {
    const violations: { file: string; line: number; tag: string; content: string }[] = [];

    for (const file of tsxFiles) {
      if (file.endsWith('.web.tsx')) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        for (const tag of DISALLOWED_HTML_TAGS) {
          const exactJsx = new RegExp(`<\\/?${tag}(?:\\s[^>]*>|>|\\/>)`, 'i');
          if (exactJsx.test(line)) {
            violations.push({
              file: path.relative(MOBILE_SRC, file),
              line: i + 1,
              tag,
              content: trimmed,
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('guarantees no unsafe conditional number rendering that can evaluate to 0 in JSX', () => {
    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        // Matches `{items.length && <` or `{count && <` which evaluates to `0` and crashes React Native
        const match = line.match(/\{([a-zA-Z0-9_?.()]+(?:\.length|Count|Size|Index|total|count))\s*&&\s*</);
        if (match) {
          violations.push({
            file: path.relative(MOBILE_SRC, file),
            line: i + 1,
            content: trimmed,
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
