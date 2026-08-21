# API stability

As of v0.1.0 the public surface — every named export of the package root — is
**frozen-additive**: new exports and new optional fields may appear in minor releases, but
nothing will be renamed, removed, or change behaviour before 1.0 except to fix a
demonstrated correctness defect. Such a fix ships as a breaking minor with a changelog
entry explaining what was wrong and what the answer is now.

Getting a wrong number is worse than getting a compile error, so a defect that changes
results will always be fixed rather than preserved for compatibility.

## What "frozen" covers

- The names, signatures and return types of every export.
- The values these functions produce for a given input, other than as above.
- The two documented divergences from QuantLib, and the reasoning behind them.

## What is not frozen

- **Calendar contents.** A newly announced closure — a funeral, a storm, a proclaimed
  holiday — is added in a patch release, which by definition changes the answer for the
  affected dates. That is the point of the package, not a breach of the promise.
- **`validThrough`.** Each calendar's checked range extends over time.
- **Error messages.** The `code` and the structured fields on every error are part of the
  API; the human-readable `message` is not, and may be reworded.
- **Internals.** Anything not exported from the package root, including module paths inside
  `dist/`, which are not a supported import target.

## Deliberately open questions, to be settled at 1.0 with real usage

1. **Calendar breadth.** Only markets that can be checked against a reference implementation
   ship. Which markets are actually wanted — TSX, TSE, SIX, ASX, Xetra are the obvious
   candidates — is a question for the people using this, not a guess made in advance.
2. **Sub-path exports.** The root entry tree-shakes to 4 KB gzipped for the business-day
   path, so `bizdate/calendars` would be ceremony without benefit today. Additive if a
   bundler that cannot tree-shake turns out to matter to someone.
3. **Compound accrual.** `accrue` is simple interest. Compounding, and conversion between
   nominal and effective rates, are the most likely additions; they will be new exports,
   not changes to this one.
4. **`Result` versus throwing.** Only `parseDate` returns a `Result`, because only untrusted
   text has an expected failure. If adopters stumble over that split, the naming — not the
   split — is what would be revisited at 1.0.

## Out of scope, permanently

Times, time zones and intraday cut-offs; early closes and half-days; locale-aware
formatting (that is `Intl`); pricing models and curve construction (that is QuantLib);
holiday data for countries rather than markets (that is `date-holidays` — see
[MIGRATING.md](MIGRATING.md) for the bridge).
