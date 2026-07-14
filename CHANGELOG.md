# Changelog

## 0.2.0 - 2026-07-13

### Changed

- Rebuilt the new-site setup screen around three clear decisions: identity, appearance, and publishing.
- Added a sticky live summary with the selected template, repository path, accent, theme, and visibility.
- Replaced silent disabled states with inline validation that focuses the first field needing attention.
- Improved responsive behavior, keyboard focus, light and dark theme contrast, and reduced-motion support.

### Added

- Added Playwright coverage for validation recovery, live summary updates, mobile overflow, and the complete mock provisioning flow.
- Added automated WCAG A and AA checks in light and dark themes with axe-core.
- Added a GitHub Actions quality workflow for type checking, builds, browser tests, and test artifacts.
