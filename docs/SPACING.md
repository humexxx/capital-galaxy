# Spacing & layout

The companion to [`TYPOGRAPHY.md`](./TYPOGRAPHY.md): how padding, margin, gap and
the app-shell offsets are standardized. **Read this before adding spacing to any
UI.**

## TL;DR

1. **Reuse the Tailwind scale. Never use arbitrary `[...]` spacing.** No
   `p-[13px]`, no `mt-[22px]`, no `gap-[10px]`. The base unit is **4px** (`1` =
   `0.25rem`); every spacing utility is a multiple of it. If a one-off value
   feels necessary, you're almost always reaching for the wrong step — pick the
   nearest scale step instead.
2. **The portal rhythm is the `*-6` (24px) / `*-2` (8px) family.** `gap-6` /
   `space-y-6` separate sections; `gap-2`–`gap-4` separate items within a row or
   list; `p-4`–`p-6` pad cards. Prefer the common steps **`1 2 3 4 6 8 12`**;
   reach for larger steps (**`16 24`**) only on the marketing landing, which
   breathes at a bigger rhythm than the dense portal.
3. **Page padding is centralized — don't reinvent it per page.** Every portal
   route renders [`PortalPageContainer`](../components/portal/page-container.tsx),
   which owns the outer padding and max-width. Put page content inside it; don't
   add your own outer `px-*`/`py-*` shell on a page.

## The app shell scrolls differently on a phone

Below `md` the **document** is the scroller: `app/portal/layout.tsx` uses
`min-h-svh` and its `<main>` drops `overflow-auto`. That is what lets the
browser's own pull-to-refresh work — the gesture only fires when the root
scroller is overscrolled at the top, and a shell pinned to `h-svh` with the
content in an inner `overflow-auto` never gives it the chance. `globals.css`
matches: `overscroll-behavior-x: none` everywhere (horizontal chaining runs
into the back-swipe), vertical left alone below `md` — `none` *or* `contain`
on the viewport is what disables pull-to-refresh.

From `md` up the shell goes back to a fixed-height app frame with its own
scrolling pane, which is what keeps the sidebar and header in place, and
`overscroll-behavior: none` returns because the document edge is never reached.

## Dialogs on a phone

- **Override `DialogContent`'s width from `sm:` up, never unprefixed.** The
  component ships `max-w-[calc(100%-2rem)] … sm:max-w-md`; that first class is
  the 16px gutter a phone needs. A bare `max-w-2xl` replaces it at *every*
  width through `tailwind-merge`, so the dialog runs edge to edge on a 390px
  screen. Write `sm:max-w-2xl`.
- **A control with a button beside it uses `min-w-0 flex-1`, not `w-full`.**
  In a flex row `w-full` means "100% of the row" and ignores the sibling, so
  the pair overflows by the button's width — which is where a dialog's
  horizontal scrollbar comes from. Better still, put the button *inside* the
  control with `InputGroup` + `InputGroupAddon` (see `components/ui/date-field.tsx`),
  which is what shadcn provides for it and cannot overflow at all.


## Page content container

[`components/portal/page-container.tsx`](../components/portal/page-container.tsx)
is the single source of truth for page-level padding and width:

```
mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:px-12
```

- **Horizontal:** `px-4 sm:px-8 lg:px-12` (16 → 32 → 48px gutters).
- **Vertical:** `py-6 sm:py-8` (24 → 32px top/bottom).
- **Section rhythm:** `gap-6` (24px) between direct children.
- **Width:** set by the `width` prop — `"default"` = `max-w-5xl` (reading width),
  `"wide"` = `max-w-7xl` (data surfaces), `"full"` = `max-w-none`.

The string is **mobile-first**: the unprefixed step is the phone value and `sm:`
pins the desktop one. If you ever retune it, step the base down from desktop —
don't leave a single unprefixed value that phones inherit (see the
[responsive-ui skill](../.github/skills/responsive-ui/SKILL.md)).

### Where to render it

**Each route renders its own container and declares its width.** It used to sit
in `app/portal/layout.tsx` and sniff `usePathname()` to widen `/portal/plans`,
which buried a list of special-cased routes inside the shared shell and forced
the whole container to be a client component. Now:

- Several routes under one segment share a width → put it in that segment's
  `layout.tsx` (see `app/portal/{entertainment,productivity,admin}/layout.tsx`,
  and `app/portal/plans/layout.tsx` for `width="wide"`).
- A one-off route → wrap the page's own return.

Exactly one container per route: nesting two would double the padding.
Never fork the padding string — change the width, not the gutters.

## App-shell offsets (header + sidebar)

These three values are coupled — change one, change the others:

| Piece | Value | Where |
| --- | --- | --- |
| Header height | `h-14` (56px) | [`app-header.tsx`](../components/app-header.tsx) |
| Sidebar top offset | `top-14` + `h-[calc(100svh-3.5rem)]` | [`app-sidebar.tsx`](../components/app-sidebar.tsx) |
| Sidebar content top breathing | `pt-18` (72px) | [`app-sidebar.tsx`](../components/app-sidebar.tsx) |
| Sidebar left inset | `px-2` (8px) | [`app-sidebar.tsx`](../components/app-sidebar.tsx) |
| Sidebar nav row height / gap | `h-8` / `gap-0.5` | [`app-sidebar.tsx`](../components/app-sidebar.tsx) |

The header has **no bottom border** and the sidebar has **no right border** — the
shell reads as one flat surface (the shadcn-docs look), separated only by space.
The `h-[calc(...)]` on the sidebar is the one sanctioned arbitrary value: it's a
computed height, not a spacing step.

## Cards & sections

- Card padding comes from the shadcn `Card`/`CardHeader`/`CardContent`
  primitives — don't override it with custom `p-*` unless a design genuinely
  needs it.
- **To line figures up across a row of cards, pin them to the bottom**
  (`mt-auto` on `CardContent`), don't try to equalise the headers. Cards in a
  grid row already stretch to a common height, so bottom-aligned content lines
  up whatever the title and description do — and a title that wraps to two
  lines in one card is enough to break any header-height scheme. Keep variable
  status (badges, notes) *above* the figures for the same reason: anything
  below them shifts them up in whichever card happens to have it.
- **`Card` clips its children (`overflow-hidden`).** Anything meant to straddle
  its edge — a chip at `-top-2.5`, a notch, a floating label — renders sliced in
  half if it is a *child*. Make it a sibling instead: wrap the card in a
  `relative` container and position the badge against that.
- **Never add `pt-6` to `CardContent`.** `Card` already carries the vertical
  padding (`py-6`, or `py-4` at `size="sm"`); `CardContent` supplies only the
  horizontal `px-6`. Adding `pt-6` therefore *doubles* the top gap to 48px
  instead of setting it, which reads as a stray band of empty space above the
  first line of content. It is an easy mistake because the class looks like it
  is establishing padding rather than stacking on top of it — five components
  in this repo had it. A card with no `CardHeader` needs no top padding at all:
  `<Card><CardContent>` is already correct.
- Stack related blocks with `flex flex-col gap-4`/`gap-6`; lay rows out with
  `gap-2`/`gap-3`/`gap-4`. **One property for both axes**, which is what the
  shadcn skill asks for and what the shadcn components themselves use.
  `space-y-*` is the older form: it works by giving every child but the first a
  top margin, so it fights `:first-child` rules, does nothing for a wrapping
  row, and collapses against a child's own margin.

  Converting is **not** a rename. `gap` does nothing outside a flex or grid
  container, so `space-y-4` becomes `flex flex-col gap-4` — dropping the
  `flex flex-col` silently removes the spacing. And a block that becomes a
  flex container gives its children `min-width: auto`, which is how a
  scrolling rail ends up widening its own column: pair the change with
  `min-w-0` on anything that must be allowed to shrink.

  `components/travel/**` is converted. The rest of the app still uses
  `space-y-*` and is fine to leave until it is touched — a half-converted
  file is worse than a consistent old one.

## Surfaces & radius (the iOS look)

- **One radius token.** `--radius` is 14px, so `rounded-md` (buttons, fields,
  menu items) is 12px, `rounded-lg` (menus, tab tracks) 14px, `rounded-xl`
  (cards) 18px and `rounded-2xl` (dialogs, bottom sheets) 22px. Never write a
  pixel radius; pick the step that names the surface.
- **Grouped surfaces.** The page is the cool grey `--background`
  (systemGroupedBackground); cards, fields, dialogs and menus are the white
  `--card` / `--popover`. Anything that must read as "on top of the page" uses
  those, not `bg-background` — inside a card `bg-background` paints grey.
- **Press feedback.** `Button` dims and shrinks a touch on `:active`; do not add
  a second hover-only affordance on top of it.
- **Control height is 40px** (`h-10`) for `Button`, `Input`, `SelectTrigger`
  and `InputGroup` alike, so a field and the button beside it line up. `sm`
  (32px) is for toolbars and table rows. Skeletons for a form row are `h-10`.
- **Dialogs are sheets on a phone.** Below `sm`, `DialogContent` pins to the
  bottom edge with a grabber and slides up; from `sm` it is the centred card.
  Nothing to opt into — but do not fight it with `top-*` overrides.
- **System colours.** `--primary` is system blue, `--destructive` system red,
  `--success` system green (the on-state of `Switch`), `--warning` system
  orange. Status text and tints use these tokens (`text-success`,
  `bg-destructive/10`, `border-warning/40`), never raw `emerald-*` / `rose-*` /
  `amber-*` steps — the tokens already carry their dark-mode value. The light
  steps sit deeper than Apple's swatches on purpose: they are read as small
  text on white far more than as fills, and systemGreen itself is 2.3:1 there. The chart
  palette is separate and validated; it does not follow these.

## Adding a new step

Don't. Use the nearest existing scale step. If a recurring need is real (e.g. a
new shell offset), add it as a documented value here and in the owning component
— never as a scattered arbitrary `[...]` value.
