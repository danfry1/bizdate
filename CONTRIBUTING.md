# Contributing

Thanks for looking. Issues and pull requests are welcome, particularly:

- **A calendar that is wrong.** A market closure this package misses, or one it invents,
  is a bug worth a patch release. Please include the date, the calendar, and a source —
  an exchange notice, a SIFMA schedule, a government announcement.
- **A convention that is missing.** New day count conventions are in scope when they can be
  validated against a published definition or a reference implementation.
- **A market this package does not cover.** New calendars are welcome if they can be
  expressed as rules and checked against QuantLib.

## Getting set up

```sh
bun install
bun run test        # the whole suite, about a second
bun run check:release   # everything CI runs
```

The project uses [bun](https://bun.sh). `bun run test:watch` is the usual loop.

## Regenerating the golden fixtures

The fixtures in `tests/fixtures/` are generated from QuantLib. To rebuild them you need
Python with the `QuantLib` package:

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt   # QuantLib==1.43
.venv/bin/python scripts/generate-golden.py tests/fixtures
```

The version is pinned because the fixtures record which QuantLib produced them, and the
golden tests assert it: regenerating with a different version is a deliberate act, not a
silent change of reference.

A regenerated fixture that changes an existing value is a signal in itself: either this
package or QuantLib changed behaviour, and the pull request should say which.

## What a change needs

- **A test that would fail without it.** Exact assertions, real expected values — no
  `toBeTruthy`, no assertions that pass either way.
- **Deliberate divergence from QuantLib is documented.** If a change makes this package
  disagree with the reference, add it to `KNOWN_DIVERGENCES` in
  `tests/golden-holidays.test.ts` with the reason and a source.
- **No new runtime dependencies.** This package ships with none, and that is a feature.
- **`bun run check:release` passes**: formatting, lint, dead-code, types, coverage
  thresholds, the packed-package smoke test, and the suite re-run against the built
  artifact.

## Style

TypeScript in strict mode with no `any`, no non-null assertions and no unchecked casts.
Errors are typed classes with a literal `code`. Comments explain why something is the way
it is — a market rule, a rounding decision — not what the line does.
