#!/bin/bash

# Setup script for Playwright browsers
# This installs the necessary browser binaries for Playwright to work

echo "🎭 Setting up Playwright browsers..."
echo ""

# Check if we need to install playwright package (not just playwright-core)
if ! npm list playwright --depth=0 > /dev/null 2>&1; then
    echo "📦 Installing playwright package (includes browser binaries)..."
    npm install --save-dev playwright
else
    echo "✅ Playwright package already installed"
fi

# Install browsers
echo ""
echo "🌐 Installing Chromium browser..."
npx playwright install chromium

echo ""
echo "✅ Playwright setup complete!"
echo ""
echo "You can now run:"
echo "  npx tsx scripts/test-target-playwright.ts"
