import { describe, expect, it } from 'vitest';

import {
  legacyBodyToHtml,
  richTextToPlainText,
  sanitizeRichTextHtml,
} from './richText';

describe('rich text document helpers', () => {
  it('keeps supported formatting while removing executable markup', () => {
    const sanitized = sanitizeRichTextHtml(
      '<p><strong>Safe</strong><img src=x onerror=alert(1)><script>alert(1)</script></p>'
      + '<a href="javascript:alert(1)">bad</a><font color="#dc2626">red</font>',
    );

    expect(sanitized).toBe(
      '<p><strong>Safe</strong>alert(1)</p>bad<span style="color: #dc2626">red</span>',
    );
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).not.toContain('javascript:');
  });

  it('converts legacy global formatting into equivalent rich HTML', () => {
    expect(legacyBodyToHtml('First\nSecond', {
      bold: true,
      italic: false,
      list: true,
      underline: false,
    })).toBe('<strong><ul><li>First</li><li>Second</li></ul></strong>');
  });

  it('derives searchable plain text from rich blocks and lists', () => {
    expect(richTextToPlainText('<p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul>'))
      .toBe('Hello world\n• One\n• Two');
  });
});
