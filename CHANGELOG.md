# Change Log
All notable changes to this project will be documented in this file (the format is based on [Keep a Changelog](http://keepachangelog.com/)).
This project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased
### BREAKING CHANGES
- Updated minimum supported VS Code version to 1.25

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
