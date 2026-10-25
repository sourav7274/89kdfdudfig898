# Visual system

Reference inspected: https://reint.ai/ on 25 October 2026, live computed styles.
Inter, #fcfcfc background, #2b2a2a text, #5a5856 secondary text and #148937 green.
The user's reference is binding. Adapt its restrained identity to an operational
workspace rather than reproducing marketing claims or its landing-page layout.

## Tokens

- Canvas #f7f8f5; paper #ffffff; text #2b2a2a; muted #62665f.
- Brand #148937; interactive green #10702e; green wash #edf6ee.
- Actual series #546e85; signed error uses words and signs as well as colour.
- Borders #e1e5dc; navigation rail #f1f3ed.
- Inter body and headings; tabular numerals for measured values.
- 8px spacing rhythm, 12px panel corners, compact control corners.

## Structure and behaviour

Desktop: compact persistent left navigation; the top bar holds one "Show actuals"
checkbox, the only switch between decision and after-delivery review. Title and
date/cutoff toolbar share one row. Full-width stage: chart on the
left, sticky side rail on the right with day summary and accuracy evidence, so the
first viewport holds all key numbers. Hourly records and methodology swap into the
rail (it widens) instead of extending the page. One focused hour is shared by the
chart marker, the readout above the chart and the highlighted record row.
Collapsing (ClickUp-style): sidebar folds to a 64px icon strip ([ key), side rail
folds to a 52px icon strip (] key), and each rail section folds to its heading plus
a one-line summary. Choices persist in localStorage.
Below 1080px the rail stacks under the chart and cannot collapse. Mobile: horizontal navigation,
stacked controls, chart remains legible and table scrolls independently.
Motion: sliding view pill, rail panel slide-in, numbers glide between selections,
hint bubbles on hover/focus. All disabled under reduced motion.
No fabricated alerts, account controls or unavailable navigation destinations.
Focus outlines, reduced-motion support, labelled inputs, explicit empty/error/loading
states. Selected inputs never label results from a previous query.

## Cache policy

TanStack Query keys include snapshot identity, view, decision date and cutoff.
Immutable snapshot results stay fresh within the session; unused analysis queries
are retained for 30 minutes. No focus polling. One retry for transient failures;
none for validation errors. Fetch consumes cancellation and a 20-second timeout.
Snapshot identity is rechecked on a new page load; no persistent stale cache.
