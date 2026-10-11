# Renderer infrastructure

Shared types, styles and helpers used by the renderer components under
`src/components/` (`contentRenderer/`, `messageRenderer/`, `toolResultRenderer/`).
Import everything from the barrel:

```tsx
import { getVariantStyles, layout, type RendererVariant } from "@/components/renderers";
```

## Files

| File        | Purpose                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `types.ts`  | `BaseRendererProps`, `IndexedRendererProps`, `RendererVariant`, `TOOL_VARIANTS`, `ProgrammingLanguage` |
| `styles.ts` | `getVariantStyles`, `layout`, `codeTheme`, `VariantStyles`                      |
| `utils.ts`  | Language detection, numbered-line parsing, system-reminder parsing, path helpers |
| `index.ts`  | Barrel re-exporting the public surface                                         |

## Variants

`RendererVariant` is the semantic category of a renderer (`success`, `info`,
`warning`, `error`, `neutral`, `code`, `file`, `search`, `task`, `system`,
`thinking`, `git`, `web`, `mcp`, `document`, `terminal`).
`TOOL_VARIANTS` maps a tool name (`Read`, `Bash`, `Grep`, ...) to its variant and
falls back to `default` (`info`).

`getVariantStyles(variant)` returns Tailwind classes built from design tokens
(no hard-coded colors), so dark mode works without extra code:

```tsx
const styles = getVariantStyles("success");
<div className={`${layout.rounded} ${layout.containerPadding} border ${styles.container}`}>
  <span className={styles.title}>Done</span>
</div>
```

`VariantStyles` fields: `container`, `icon`, `title`, `badge`, `badgeText`, `accent`.

## Layout and code theme

`layout` holds the spacing, text-size, radius and max-height classes shared by
all renderers (`containerPadding`, `headerPadding`, `titleText`, `bodyText`,
`monoText`, `rounded`, `codeMaxHeight`, `contentMaxHeight`, `prose`, ...).
Use these instead of ad-hoc Tailwind values so renderers stay visually uniform.

`codeTheme` (`fontSize`, `lineHeight`, `padding`) is the Prism theme override for
every syntax-highlighted block.

## Utilities

- `getLanguageFromPath(path)` / `detectLanguageFromContent(code)`: pick a `ProgrammingLanguage`.
- `hasNumberedLines(text)` / `extractCodeFromNumberedLines(text)`: strip `cat -n` style prefixes.
- `parseSystemReminders(text)`: split `<system-reminder>` blocks from the main text.
- `isFileSearchResult(text)`, `parseFilePath(path)`: file-listing and path helpers.
- `safeStringify(value, pretty?)`: JSON.stringify that never throws.

## Adding a renderer

1. Pick a variant (add it to `RendererVariant`, `VARIANT_STYLES` and, for tools, `TOOL_VARIANTS` if none fits).
2. Extend `BaseRendererProps` for the component props.
3. Style with `getVariantStyles` + `layout`; wrap user-visible strings in `t()` and add the keys to all five locales.
