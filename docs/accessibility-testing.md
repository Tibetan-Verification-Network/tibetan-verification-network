# Accessibility testing

Automated checks run in CI; manual checks cover Tibetan rendering and real keyboards.

## Automated (CI and local)

- **Vitest + axe-core** — public and editorial components (`npm test` in `frontend/`).
- **Playwright + @axe-core/playwright** — public flows, keyboard specs, and security crawl (`npm run e2e` against a seeded Compose stack). CI job: *End-to-end and accessibility* in `.github/workflows/ci.yml`.
- **Projects** — Desktop Chromium runs the full suite including the long editorial workflow. Mobile WebKit (iPhone 13 profile) runs public, keyboard, and security specs only.

## Manual device matrix (Tibetan)

Run before major releases or after font/locale changes. Record date, build, and tester.

| Environment | Checks |
| --- | --- |
| iOS Safari | Tibetan headlines and body on home, article, and About; language switcher; submit form labels |
| Android Chrome + Tibetan keyboard | Submit claim and search query in Tibetan; tsheg and stacked vowels display correctly |
| Windows Chrome / Edge | Keyboard-only path: skip link → search → article; focus visible on buttons and links |
| macOS Safari | Same as Windows; verify `lang="bo"` on Tibetan routes |

## Known gaps

- Staff UI copy is English-only; Tibetan editorial strings are not yet reviewed.
- About and methodology text in both locales is provisional pending editorial sign-off.
