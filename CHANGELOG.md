# Change Log
All notable changes to this project will be documented in this file (the format is based on [Keep a Changelog](http://keepachangelog.com/)).
Development-only changes (e.g. updates to `devDependencies`) will not be listed here, as they don’t affect the public features.
This project adheres to [Semantic Versioning](http://semver.org/).

## 3.1.1 - 2021-02-12
### Fixed
- Corrected broken image paths in the README.

## 3.1.0 - 2021-02-12
### Added
- Line folding added for comments and symbols.

### Changed
- Rewrote file parser to enable new functionality.
- "Go to definition" is more context-aware to reduce ambiguity (e.g. a `Zone` referencing a `Rule` will no longer reference a `Link` with the same name).
- Consecutive lines for the same `Rule` are combined into a single symbol, to simplify results for "go to definition" and "find all references".

### Fixed
- "Go to definition" for a `Rule` name within a `Zone` wasn't working on lines that followed comment lines (e.g. `Africa/Tripoli`).
- Ctrl/Cmd + hover over a `Zone` name underlines the full name instead of just one word.
- Outline view in the sidebar now correctly shows symbols in file order instead of alphabetical order.

## 3.0.0 - 2020-12-13
### BREAKING CHANGES
- Updated minimum supported VS Code version to 1.50.

### Changed
- Improved startup performance by deferring/lazy-loading file parsing.

## 2.1.1 - 2018-02-07
### Fixed
- Better matching of time strings to support negative SAVE values.

## 2.1.0 - 2017-10-21
### Added
- Support for multi-root workspaces in VS Code.

## 2.0.0 - 2017-09-05
### Added
- Parsing and integration of definitions for links, rules, and zones.
- "Go to definition" support within `Link -> Zone` and `Zone -> Rule` references.
- "Find all references" for `Rule` and `Zone` definitions.
- Browse all symbols (`Link`, `Rule`, and `Zone` definitions) in a document.
- Search for symbols across a workspace.

## 1.0.0 - 2017-08-16
- Initial release.
- Syntax highlighting and indendation rules for zoneinfo source files.
