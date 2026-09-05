# Repository Guidelines

## Project Structure & Module Organization

This desktop etcd manager uses Tauri 2, React 19, TypeScript, and Chakra UI.
- `src/components/`: tabs, dialogs, shared controls, and UI themes.
- `src/api/etcd.ts`: typed Tauri command wrappers; keep these synchronized with Rust commands and serialized types.
- `src/hooks/`, `src/contexts/`, `src/stores/`, and `src/utils/`: frontend behavior, state, and helpers.
- `src-tauri/src/`: Rust backend; `lib.rs` exposes commands, `client.rs` manages connections, and dashboard/query/snapshot modules handle browsing.
- `src-tauri/icons/` and `screenshots/`: application icons and documentation images. `dist/` is generated frontend output.
- `.github/workflows/release.yaml`: cross-platform release builds.

## Build, Test, and Development Commands

Use Node.js LTS, stable Rust, `protoc`, and the platform's Tauri build prerequisites. Run commands from the repository root:
- `npm ci`: install dependencies from `package-lock.json`.
- `npm run tauri dev`: launch the desktop app with frontend hot reload.
- `npm run dev`: start Vite on port 1420; native commands require the Tauri runtime.
- `npm run build`: run TypeScript checks and produce frontend assets.
- `npm run tauri build`: build and package the desktop application.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: check Rust formatting.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets`: lint Rust; `unwrap_used` is configured to warn.

## Development Principles

Use established best practices and recommended approaches for the languages, frameworks, and libraries involved. Fix root causes rather than introducing hacks or workarounds. Prefer supported APIs and maintainable solutions. Follow rustfmt for Rust formatting.

## Testing Guidelines

Rust tests live in inline `#[cfg(test)]` modules, including `dashboard.rs`, `snapshot.rs`, and `query_manager.rs`. Use descriptive snake_case test names and add regression tests for changed backend behavior. No frontend test runner or coverage threshold is configured. Run the frontend build and manually exercise affected desktop flows against a disposable etcd cluster, including profile locks and edit conflicts when relevant.

## Commit & Pull Request Guidelines

Follow Conventional Commits: `<type>[optional scope]: <description>`, for example, `fix: reconnect after profile updates`. Use the appropriate type, such as `feat`, `fix`, `refactor`, `docs`, or `test`; mark breaking changes with `!` or a `BREAKING CHANGE:` footer. Keep changes focused. PRs should explain behavior changes, link relevant issues, list validation performed, and include screenshots for visible UI changes. Never commit credentials, private certificates, or local `config.json` files.
