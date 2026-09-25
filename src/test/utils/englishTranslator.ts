import session from "@/i18n/locales/en/session.json";
import renderers from "@/i18n/locales/en/renderers.json";
import common from "@/i18n/locales/en/common.json";

const EN: Record<string, string> = { ...common, ...session, ...renderers };

/**
 * `t()` stand-in for component tests: resolves keys against the English
 * locale files and interpolates `{{name}}` placeholders, so assertions read
 * like the real UI. Unknown keys fall back to `defaultValue`, then the key.
 */
export function englishT(key: string, options?: Record<string, unknown>): string {
  const template = EN[key] ?? (options?.defaultValue as string | undefined) ?? key;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    options && name in options ? String(options[name]) : match,
  );
}
