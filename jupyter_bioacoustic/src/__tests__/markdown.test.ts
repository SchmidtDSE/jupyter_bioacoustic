/**
 * @jest-environment jsdom
 *
 * Markdown / HTML escaping (description + template text can come from remote YAML): no
 * attribute break-out, no javascript: links.
 *
 * License: BSD 3-Clause
 */

import { renderMarkdown, safeHref } from '../sections/DescriptionPanel';
import { escapeHtml } from '../util';

/** Render into a real element so we check what the browser would actually build. */
function render(md: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = renderMarkdown(md);
  return el;
}

describe('renderMarkdown links', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('neutralises %j', url => {
    const a = render(`[click](${url})`).querySelector('a')!;
    expect(a.getAttribute('href')).toBe('#');
  });

  it('cannot break out of the href attribute', () => {
    const a = render('[x](a" onmouseover="alert(1))').querySelector('a')!;
    expect(a.getAttribute('onmouseover')).toBeNull();
    expect(a.attributes.length).toBe(3);                    // href, target, rel
  });

  it.each(['https://example.org/a?b=1', 'mailto:me@x.org', 'docs/readme.md', '#section'])(
    'keeps safe link %j', url => {
      expect(render(`[ok](${url})`).querySelector('a')!.getAttribute('href')).toBe(url);
    });

  it('escapes raw HTML in text', () => {
    const el = render('hello <img src=x onerror="alert(1)">');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });
});

describe('escapeHtml / safeHref', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('allows relative links without a scheme', () => {
    expect(safeHref('./a/b')).toBe('./a/b');
  });
});
