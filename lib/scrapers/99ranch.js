const axios = require('axios');

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

async function getNearestStore(zip) {
    try {
        const res = await withTimeout(axios.post(
            "https://www.99ranch.com/be-api/store/web/nearby/stores",
            {
                zipCode: zip,
                pageSize: 1,
                pageNum: 1,
                type: 1,
                source: "WEB",
                within: null
            },
            {
                headers: {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "lang": "en_US",
                    "time-zone": "America/Los_Angeles",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive"
                }
            }
        ), 5000);

        const stores = res.data?.data?.records || [];
        if (!stores.length) {
            return null;
        }

        const store = stores[0];
        return {
            id: store.id,
            name: store.name,
            fullAddress: store.address,
            street: store.street,
            city: store.city,
            state: store.state,
            zipCode: store.zipCode,
            latitude: store.latitude,
            longitude: store.longitude,
        };
    } catch (error) {
        console.error("Error getting nearest 99 Ranch store:", error.message);
        return null;
    }
}

const buildCache = {
    id: null,
    fetchedAt: 0,
};

async function getBuildId() {
    if (buildCache.id && Date.now() - buildCache.fetchedAt < 1000 * 60 * 60) {
        return buildCache.id;
    }

    try {
        const res = await axios.get("https://www.99ranch.com/en_US", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            },
        });

        const match = typeof res.data === "string" ? res.data.match(/"buildId":"([^"]+)"/) : null;
        if (!match) {
            throw new Error("Unable to extract Next.js build ID");
        }

        buildCache.id = match[1];
        buildCache.fetchedAt = Date.now();
        return buildCache.id;
    } catch (error) {
        console.error("Error fetching 99 Ranch build ID:", error.message);
        throw error;
    }
}

async function searchProducts(store, keyword, zipCode) {
    if (!store?.id) {
        return [];
    }

    const cookie = [`storeid=${store.id}`, `zipcode=${zipCode}`, "deliveryType=1"].join("; ");

    try {
        const res = await withTimeout(
            axios.post(
                "https://www.99ranch.com/be-api/search/web/products",
                {
                    page: 1,
                    pageSize: 28,
                    keyword,
                    availability: 1,
                },
                {
                    headers: {
                        "accept": "application/json",
                        "content-type": "application/json",
                        "storeid": store.id,
                        "deliveryType": "1",
                        "time-zone": "America/Los_Angeles",
                        "lang": "en_US",
                        "origin": "https://www.99ranch.com",
                        "referer": `https://www.99ranch.com/search?keyword=${encodeURIComponent(keyword)}`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache",
                        Cookie: cookie,
                    },
                },
            ),
            5000,
        );

        return res.data?.data?.list || [];
    } catch (error) {
        console.error("Error searching 99 Ranch products via API:", error.message);
        return [];
    }
}

const DEFAULT_99_RANCH_ZIP = process.env.DEFAULT_99_RANCH_ZIP || "94709"

async function search99Ranch(keyword, zipCode) {
    try {
        const userZip = (zipCode && zipCode.trim()) || DEFAULT_99_RANCH_ZIP
        let store = await getNearestStore(userZip);
        if (!store && userZip !== DEFAULT_99_RANCH_ZIP) {
            console.warn(`No 99 Ranch store near ${userZip}, falling back to ${DEFAULT_99_RANCH_ZIP}`)
            store = await getNearestStore(DEFAULT_99_RANCH_ZIP)
        }
        if (!store?.id) {
            console.warn("No nearby 99 Ranch store found for zip code:", zipCode);
            return [];
        }

        const products = await searchProducts(store, keyword, userZip);
        const cleaned = products
            .filter(p => p.salePrice && p.salePrice > 0) // Filter out products without prices
            .map(p => ({
                id: p.productId || `99ranch-${Math.random()}`,
                title: p.productName || p.productNameEN || "Unknown Product",
                brand: p.brandName || p.brandNameEN || "",
                price: parseFloat(p.salePrice) || 0,
                pricePerUnit: p.saleUom || "",
                unit: p.variantName || p.variantNameEN || "",
                image_url: p.image || p.productImage?.path || "",
                provider: "99 Ranch",
                location: store.fullAddress || `${store.name || "Unknown"} 99 Ranch Market`,
                category: p.category || "Grocery"
            }));

        return cleaned.sort((a, b) => a.price - b.price);
    } catch (error) {
        console.error("Error in 99 Ranch scraper:", error.message);
        return [];
    }
}

// Export the function for use in other modules
module.exports = { search99Ranch };

// Run if called directly
if (require.main === module) {
    const keyword = process.argv[2];
    const zipCode = process.argv[3];

    if (!keyword || !zipCode) {
        console.error("Usage: node 99ranch.js <keyword> <zipCode>");
        process.exit(1);
    }

    search99Ranch(keyword, zipCode).then(results => {
        console.log(JSON.stringify(results));
    }).catch(console.error);
}
