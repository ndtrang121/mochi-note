export interface RichTextFormat {
  bold: boolean;
  italic: boolean;
  list: boolean;
  underline: boolean;
}

export const EMPTY_RICH_TEXT_FORMAT: RichTextFormat = {
  bold: false,
  italic: false,
  list: false,
  underline: false,
};

const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const BLOCK_TAGS = new Set(['DIV', 'LI', 'OL', 'P', 'UL']);

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeColor(value: string | null) {
  const color = value?.trim() ?? '';
  return SAFE_COLOR.test(color) ? color : null;
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (!(node instanceof HTMLElement)) return '';

  const children = [...node.childNodes].map(sanitizeNode).join('');
  switch (node.tagName) {
    case 'B':
    case 'STRONG': return `<strong>${children}</strong>`;
    case 'EM':
    case 'I': return `<em>${children}</em>`;
    case 'U': return `<u>${children}</u>`;
    case 'BR': return '<br>';
    case 'UL': return `<ul>${children}</ul>`;
    case 'OL': return `<ol>${children}</ol>`;
    case 'LI': return `<li>${children}</li>`;
    case 'DIV':
    case 'P': return `<p>${children}</p>`;
    case 'A': {
      const href = node.getAttribute('href');
      try {
        const url = new URL(href ?? '');
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return children;
        return `<a href="${escapeHtml(url.href)}" rel="noreferrer noopener" target="_blank">${children}</a>`;
      } catch {
        return children;
      }
    }
    case 'FONT': {
      const color = safeColor(node.getAttribute('color'));
      return color ? `<span style="color: ${color}">${children}</span>` : children;
    }
    case 'SPAN': {
      const color = safeColor(node.style.color);
      return color ? `<span style="color: ${color}">${children}</span>` : children;
    }
    default: return children;
  }
}

export function sanitizeRichTextHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.childNodes].map(sanitizeNode).join('');
}

function nodePlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  const text = [...node.childNodes].map(nodePlainText).join('');
  if (node.tagName === 'LI') return `• ${text.trim()}\n`;
  return BLOCK_TAGS.has(node.tagName) ? `${text.trim()}\n` : text;
}

export function richTextToPlainText(html: string) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeRichTextHtml(html);
  return [...template.content.childNodes]
    .map(nodePlainText)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function legacyBodyToHtml(body: string, format: RichTextFormat) {
  if (!body) return '';
  const lines = body.split(/\r?\n/).map((line) => escapeHtml(line));
  let html = format.list
    ? `<ul>${lines.filter(Boolean).map((line) => `<li>${line}</li>`).join('')}</ul>`
    : lines.join('<br>');
  if (format.underline) html = `<u>${html}</u>`;
  if (format.italic) html = `<em>${html}</em>`;
  if (format.bold) html = `<strong>${html}</strong>`;
  return html;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
