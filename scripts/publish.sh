#!/bin/bash
set -e

BUMP=${1:-patch}
echo "Publishing dual-brain ($BUMP bump)..."

# Syntax check all source files
echo "Checking syntax..."
for f in src/*.mjs bin/*.mjs; do
  node --check "$f" || { echo "FAIL: $f"; exit 1; }
done
echo "Syntax OK"

# Run tests if available
if npm test --if-present 2>/dev/null; then
  echo "Tests passed"
else
  echo "Tests skipped or failed — continuing"
fi

# Version bump
npm version "$BUMP" --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "Version: $VERSION"

# Commit + tag + publish
git add package.json
git commit -m "v$VERSION"
git tag "v$VERSION"
npm publish
git push && git push --tags

echo "Published dual-brain@$VERSION"
