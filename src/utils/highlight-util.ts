import hljs from 'highlight.js/lib/core';
import oneC from 'highlight.js/lib/languages/1c';

const IDENTIFIER_RE = '[A-Za-zА-Яа-яёЁ_][A-Za-zА-Яа-яёЁ_0-9]*';
const IDENTIFIER_CHAR_RE = '[A-Za-zА-Яа-яёЁ_0-9]';

// Mode-level keywords declared as a plain string are matched with the default
// \w+ pattern, which never matches Cyrillic words, so `Функция` and
// `КонецФункции` inside a declaration would keep the surrounding token color.
// Re-declare such keyword sets with the Cyrillic-aware identifier pattern.
const relaxKeywordPattern = (mode: { keywords?: unknown; contains?: unknown[]; variants?: unknown[] }): void => {
  if (typeof mode.keywords === 'string') {
    mode.keywords = { $pattern: IDENTIFIER_RE, keyword: mode.keywords };
  } else if (mode.keywords && typeof mode.keywords === 'object' && '$pattern' in mode.keywords) {
    (mode.keywords as { $pattern: string }).$pattern = IDENTIFIER_RE;
  }
  (mode.contains ?? []).forEach((child) => relaxKeywordPattern(child as typeof mode));
  (mode.variants ?? []).forEach((child) => relaxKeywordPattern(child as typeof mode));
};

// The upstream 1C grammar uses an identifier pattern that requires at least
// two characters, so the single-character keyword `И` (AND) never matches.
// Relax the pattern to also cover one-character identifiers.
// The grammar also colors only procedure/function declarations, while the
// 1C:Enterprise Designer (Конфигуратор) colors every call site as well, so an
// identifier directly followed by `(` is added as a `function` token. Keywords
// and literals are excluded because the Designer keeps them in the keyword
// color even when they are followed by `(` (e.g. `Если (` or `И (`).
const oneCFixed = (hljsApi: Parameters<typeof oneC>[0]) => {
  const language = oneC(hljsApi);
  const keywords = language.keywords;
  let keywordExclusion = '';
  if (keywords && typeof keywords === 'object' && '$pattern' in keywords) {
    keywords.$pattern = IDENTIFIER_RE;
    const keywordList = ['keyword', 'literal']
      .flatMap((group) => String((keywords as Record<string, unknown>)[group] ?? '').split(/\s+/))
      .filter(Boolean);
    if (keywordList.length > 0) {
      // \b is unusable here: it is ASCII-based and never matches next to Cyrillic letters
      keywordExclusion = `(?!(?:${keywordList.join('|')})(?!${IDENTIFIER_CHAR_RE}))`;
    }
  }
  (language.contains ?? []).forEach((mode) => relaxKeywordPattern(mode as Parameters<typeof relaxKeywordPattern>[0]));
  language.contains = [
    ...(language.contains ?? []),
    {
      className: 'function',
      // the lookbehind keeps the rule from matching the tail of a longer word
      // (e.g. `сли` inside `Если`, which the keyword exclusion rejects at its
      // first letter)
      begin: `(?<![A-Za-zА-Яа-яёЁ_0-9])${keywordExclusion}${IDENTIFIER_RE}\\s*(?=\\()`,
    },
  ];
  return language;
};

hljs.registerLanguage('1c', oneCFixed);

/**
 * Inline styles for the highlight.js token classes.
 * The palette follows the classic 1C:Enterprise Designer (Конфигуратор) scheme:
 * red keywords, literals, punctuation and operators; blue identifiers, built-in
 * functions and types; black strings and numbers; green comments; gray
 * preprocessor directives.
 * Inline styles are used on purpose instead of a stylesheet:
 * e-mail clients like Outlook strip `<style>` blocks and class selectors,
 * so only inline styles survive when the report is pasted into a mail.
 */
const TOKEN_STYLES: Record<string, string> = {
  keyword: 'color:#FF0000',
  literal: 'color:#FF0000',
  punctuation: 'color:#FF0000',
  built_in: 'color:#0000FF',
  function: 'color:#0000FF',
  class: 'color:#0000FF',
  type: 'color:#0000FF',
  title: 'color:#0000FF',
  params: 'color:#0000FF',
  string: 'color:#000000',
  number: 'color:#000000',
  comment: 'color:#008000',
  meta: 'color:#808080',
};

// In the Designer plain identifiers keep the same blue as the other
// non-keyword tokens, so the whole code block gets a blue base color that the
// token styles above override.
const BASE_TEXT_STYLE = 'color:#0000FF';

// Scopes whose text must keep its own color: characters inside strings,
// comments, dates and preprocessor directives are not operators or numbers.
const PLAIN_TEXT_EXCLUDED_SCOPES = new Set(['string', 'comment', 'meta', 'number', 'punctuation']);

// \b is ASCII-based, so the identifier boundaries around a number literal are
// checked with explicit Cyrillic-aware lookarounds (`РазмерUTF8` has no number)
const PLAIN_TEXT_TOKEN_RE =
  /&[a-zA-Z#0-9]+;|(?<![A-Za-zА-Яа-яёЁ_0-9])\d+(?:\.\d+)?(?![A-Za-zА-Яа-яёЁ_0-9])|[=()<>,;:?+\-*/%]+/g;

/**
 * Wraps tokens that the 1C grammar leaves as plain text into styled spans:
 * punctuation and operators (inside a parameter list, or `?`, `<`, `>`) become
 * `punctuation`, standalone number literals become `number`, so they can be
 * colored like the Designer does. Text inside strings, comments, dates and
 * preprocessor directives is left untouched.
 */
const colorizePlainText = (html: string): string => {
  const scopeStack: string[] = [];
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('</')) {
        scopeStack.pop();
        return part;
      }
      if (part.startsWith('<')) {
        const className = /class="hljs-([\w-]+)/.exec(part);
        scopeStack.push(className ? className[1] : '');
        return part;
      }
      if (scopeStack.some((scope) => PLAIN_TEXT_EXCLUDED_SCOPES.has(scope))) {
        return part;
      }
      return part.replace(PLAIN_TEXT_TOKEN_RE, (match) => {
        if (match.startsWith('&')) {
          return match === '&lt;' || match === '&gt;'
            ? `<span class="hljs-punctuation">${match}</span>`
            : match;
        }
        return /^\d/.test(match)
          ? `<span class="hljs-number">${match}</span>`
          : `<span class="hljs-punctuation">${match}</span>`;
      });
    })
    .join('');
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const applyInlineStyles = (html: string): string =>
  html.replace(/<span class="hljs-([\w-]+)[^"]*">/g, (_match, tokenClass: string) => {
    const style = TOKEN_STYLES[tokenClass];
    return style ? `<span style="${style}">` : '<span>';
  });

/**
 * Highlight the given code with highlight.js and return HTML where every token
 * carries its color as an inline style. Returns the plain escaped code when the
 * language is unknown or highlighting fails.
 *
 * @param code the plain source code (already Base64-decoded)
 * @param language a highlight.js language identifier, e.g. `1c`
 */
export const highlightCode = (code: string, language: string): string => {
  try {
    if (language && hljs.getLanguage(language)) {
      const isOneC = language === '1c';
      let html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      if (isOneC) {
        html = colorizePlainText(html);
      }
      html = applyInlineStyles(html);
      if (isOneC) {
        html = `<span style="${BASE_TEXT_STYLE}">${html}</span>`;
      }
      return html;
    }
  } catch {
    // fall through to the plain escaped code
  }
  return escapeHtml(code);
};
