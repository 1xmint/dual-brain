#!/bin/bash
set -e
# Quick patch publish — syntax check + bump + publish
for f in src/*.mjs bin/*.mjs; do node --check "$f" || exit 1; done
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
git add -A && git commit -m "v$VERSION" && git tag "v$VERSION"
npm publish
git push && git push --tags
echo "Published dual-brain@$VERSION"
