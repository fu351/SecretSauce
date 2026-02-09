#!/usr/bin/env node

/**
 * Debug script for Target Playwright scraper
 * Opens browser in headed mode and shows what's happening
 */

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function debugTargetScraper() {
    console.log('🔍 Debug Mode: Target Playwright Scraper\n');
    console.log('This will open a visible browser so you can see what\'s happening\n');

    const browser = await chromium.launch({
        headless: false,  // Show the browser!
        slowMo: 500,      // Slow down actions so you can see them
    });

    const context = await browser.newContext({
        geolocation: { latitude: 37.8715, longitude: -122.2730 },
        permissions: ['geolocation'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    try {
        console.log('📍 Setting geolocation to Berkeley, CA (37.8715, -122.2730)');
        console.log('🌐 Navigating to Target...\n');

        const searchUrl = 'https://www.target.com/s?searchTerm=eggs';
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

        console.log('⏳ Waiting 5 seconds for page to fully load...');
        await page.waitForTimeout(5000);

        // Take a screenshot
        await page.screenshot({ path: 'target-debug.png', fullPage: true });
        console.log('📸 Screenshot saved to: target-debug.png');

        // Check what's on the page
        const title = await page.title();
        console.log(`📄 Page title: ${title}`);

        const url = page.url();
        console.log(`🔗 Current URL: ${url}`);

        // Try to find products with different selectors
        console.log('\n🔎 Looking for products with different selectors...\n');

        const selectors = [
            '[data-test="product-details"]',
            '[data-test="@web/ProductCard"]',
            '[data-test="product-grid"]',
            '.styles__ProductCardWrapper',
            '[data-component="ProductCard"]',
            'section[data-test="product-grid"] > div',
        ];

        for (const selector of selectors) {
            const count = await page.locator(selector).count();
            console.log(`   ${selector}: ${count} elements found`);
        }

        // Check for any error messages
        const bodyText = await page.textContent('body');
        if (bodyText?.includes('robot') || bodyText?.includes('automated')) {
            console.log('\n⚠️  WARNING: Page might be detecting automation');
        }

        console.log('\n💡 The browser will stay open for 30 seconds so you can inspect it.');
        console.log('   Check if products are visible on the page.');
        console.log('   Look for any error messages or captchas.\n');

        await page.waitForTimeout(30000);

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
        console.log('\n✅ Browser closed. Check target-debug.png for screenshot.');
    }
}

debugTargetScraper();
