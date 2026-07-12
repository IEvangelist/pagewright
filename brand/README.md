# Pagewright Brand Kit

The look and feel for the Pagewright app and its default templates. Tokens here are mirrored by the
CSS variables in `@pagewright/blocks` (`packages/blocks/src/styles/blocks.css`).

## Name

**Pagewright** — a maker of pages (from *-wright*, "a builder/craftsperson," as in *playwright*,
*shipwright*). Pairs naturally with GitHub **Pages**. Always one word, capital P.

## Logo

- `logo.svg` — horizontal lockup (mark + wordmark).
- `mark.svg` — icon only (favicon / avatar / app icon).

Clear space ≥ the height of the mark's corner radius on all sides. Don't recolor, rotate, or
stretch. On busy photography, use the mark on a solid brand or neutral chip.

## Color

The brand runs on an **indigo/iris primary** with a warm **amber accent**, plus a neutral scale that
flips for dark mode. Values are authored in HSL (used directly by the block CSS variables).

| Token           | Light `H S% L%` | Dark `H S% L%` | Approx hex (light) |
| --------------- | --------------- | -------------- | ------------------ |
| `--pw-primary`  | `250 84% 60%`   | `250 90% 70%`  | `#6C5CE7`          |
| `--pw-accent`   | `33 95% 55%`    | `33 95% 60%`   | `#F59E0B`          |
| `--pw-bg`       | `0 0% 100%`     | `240 10% 7%`   | `#FFFFFF`          |
| `--pw-fg`       | `240 10% 12%`   | `0 0% 98%`     | `#1C1C22`          |
| `--pw-muted`    | `240 5% 96%`    | `240 6% 14%`   | `#F3F3F5`          |
| `--pw-muted-fg` | `240 4% 44%`    | `240 5% 66%`   | `#6B6B75`          |
| `--pw-border`   | `240 6% 90%`    | `240 5% 20%`   | `#E4E4E9`          |

Primary gradient (hero/CTA/logo): **`#6C5CE7 → #F59E0B`**, 135°.

## Typography

- **UI / headings:** a geometric humanist sans — system stack
  `ui-sans-serif, system-ui, "Segoe UI", Inter, sans-serif` (swap in **Geist** or **Inter** when a
  webfont is added).
- Headings: weight 700–800, tight tracking (`-0.02em` to `-0.03em`).
- Body: weight 400–500, line-height ~1.55.

## Voice

Friendly, encouraging, plain-spoken. We talk to non-developers: "ship," "publish," "go live" — not
"CI pipeline." Confident but never condescending.
