#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import dotenv from "dotenv"
import axios from "axios"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const { search99Ranch } = require("../lib/scrapers/99ranch.js")

dotenv.config({ path: path.join(__dirname, "../.env.local") })
dotenv.config({ path: path.join(__dirname, "../.env") })

const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 10000)
const DEFAULT_ZIP = process.env.TEST_99RANCH_ZIP || "94709"
const DEFAULT_KEYWORD = "milk"
const RAW_OUTPUT_DIR =
  process.env.TEST_99RANCH_RAW_OUTPUT_DIR ||
  path.join(__dirname, "output", "99ranch-raw")

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"

function parseArgs() {
  const args = process.argv.slice(2)
  const positional = []
  const flags = new Set()

  for (const arg of args) {
    if (arg.startsWith("--")) {
      flags.add(arg)
    } else {
      positional.push(arg)
    }
  }

  return {
    keyword: positional[0] || DEFAULT_KEYWORD,
    zipCode: positional[1] || DEFAULT_ZIP,
    full: flags.has("--full"),
    help: flags.has("--help") || flags.has("-h"),
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "query"
}

async function fetchNearestStore(zipCode) {
  const response = await axios.post(
    "https://www.99ranch.com/be-api/store/web/nearby/stores",
    {
      zipCode,
      pageSize: 1,
      pageNum: 1,
      type: 1,
      source: "WEB",
      within: null,
    },
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        lang: "en_US",
        "time-zone": "America/Los_Angeles",
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  )

  const stores = response?.data?.data?.records || []
  return {
    responseData: response?.data || null,
    store: stores[0] || null,
  }
}

async function fetchRawProducts(keyword, zipCode, storeId) {
  const cookie = [`storeid=${storeId}`, `zipcode=${zipCode}`, "deliveryType=1"].join(
    "; ",
  )

  const response = await axios.post(
    "https://www.99ranch.com/be-api/search/web/products",
    {
      page: 1,
      pageSize: 28,
      keyword,
      availability: 1,
    },
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        storeid: String(storeId),
        deliveryType: "1",
        "time-zone": "America/Los_Angeles",
        lang: "en_US",
        origin: "https://www.99ranch.com",
        referer: `https://www.99ranch.com/search?keyword=${encodeURIComponent(keyword)}`,
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Cookie: cookie,
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  )

  return response?.data || null
}

function printUsage() {
  console.log("Usage: node scripts/test-99ranch-scraper.js [keyword] [zipCode] [--full]")
  console.log("")
  console.log("Examples:")
  console.log('  node scripts/test-99ranch-scraper.js "milk" "94709"')
  console.log('  node scripts/test-99ranch-scraper.js "soy sauce" "95035" --full')
}

async function run() {
  const { keyword, zipCode, full, help } = parseArgs()
  if (help) {
    printUsage()
    return
  }

  console.log("\n" + "=".repeat(80))
  console.log("99 RANCH SCRAPER RAW OUTPUT TEST")
  console.log("=".repeat(80))
  console.log(`Keyword: ${keyword}`)
  console.log(`ZIP code: ${zipCode}`)
  console.log(`Timeout: ${REQUEST_TIMEOUT_MS}ms`)
  console.log(`Full console output: ${full ? "enabled" : "disabled"}`)

  let storePayload = null
  let selectedStore = null
  let rawProductsPayload = null
  let cleanedProducts = []
  let runError = null

  try {
    const storeResult = await fetchNearestStore(zipCode)
    storePayload = storeResult.responseData
    selectedStore = storeResult.store

    if (!selectedStore?.id) {
      throw new Error(`No nearby 99 Ranch store found for zip ${zipCode}`)
    }

    const queryZip = selectedStore.zipCode || zipCode
    rawProductsPayload = await fetchRawProducts(keyword, queryZip, selectedStore.id)
    cleanedProducts = await search99Ranch(keyword, zipCode)
  } catch (error) {
    runError = error?.message || String(error)
  }

  const rawProducts = rawProductsPayload?.data?.list || []
  const output = {
    capturedAt: new Date().toISOString(),
    input: { keyword, zipCode, timeoutMs: REQUEST_TIMEOUT_MS },
    selectedStore,
    rawStoreResponse: storePayload,
    rawProductsResponse: rawProductsPayload,
    cleanedProducts,
    counts: {
      rawProducts: rawProducts.length,
      cleanedProducts: cleanedProducts.length,
    },
    error: runError,
  }

  await fs.mkdir(RAW_OUTPUT_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const outPath = path.join(
    RAW_OUTPUT_DIR,
    `${ts}-${slugify(keyword)}-${slugify(zipCode)}.json`,
  )
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8")

  if (runError) {
    console.error(`\n❌ Test failed: ${runError}`)
  } else {
    console.log("\n✅ Requests completed successfully")
  }

  console.log(`\nStore selected: ${selectedStore?.name || "N/A"} (${selectedStore?.id || "N/A"})`)
  console.log(`Raw products count: ${rawProducts.length}`)
  console.log(`Cleaned products count: ${cleanedProducts.length}`)

  if (rawProducts.length > 0) {
    console.log("\nFirst raw product:")
    console.log(JSON.stringify(rawProducts[0], null, 2))
  }

  if (cleanedProducts.length > 0) {
    console.log("\nFirst cleaned product:")
    console.log(JSON.stringify(cleanedProducts[0], null, 2))
  }

  if (full) {
    console.log("\nFull raw store response:")
    console.log(JSON.stringify(storePayload, null, 2))
    console.log("\nFull raw products response:")
    console.log(JSON.stringify(rawProductsPayload, null, 2))
  }

  console.log(`\nSaved raw output: ${outPath}`)

  if (runError) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  console.error(`\n❌ Unhandled error: ${error?.message || String(error)}`)
  process.exit(1)
})
