const axios = require('axios');
require('dotenv').config();

const searchTerm = process.argv[2];
const zipCode = process.argv[3];

// Add your Kroger API credentials
const CLIENT_ID = "shopsage-243261243034246d665a464b4d485545587677665835526a74466a2f2e704b6d6c4d4e43702f7758624341476a6d497947637268486441527250624f2908504214587086555";
const CLIENT_SECRET = "ZoCeBUn1HvoveqtZQA4h1ji4wFh_dpe3uWLynFiO";

// Helper function to encode Base64
function encodeBase64(clientId, clientSecret) {
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

// Utility function to handle timeouts
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Function to get the Auth Token
async function getAuthToken() {
    try {
        const requestBody = "grant_type=client_credentials&scope=product.compact";

        const response = await withTimeout(
            axios.post(
                "https://api.kroger.com/v1/connect/oauth2/token",
                requestBody,
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json",
                        "Authorization": "Basic " + encodeBase64(CLIENT_ID, CLIENT_SECRET)
                    }
                }
            ),
            5000 // Timeout after 5 seconds
        );

        return response.data.access_token;
    } catch (error) {
        console.error("Error fetching auth token:", error.response?.data || error.message);
        throw new Error("Failed to fetch auth token.");
    }
}

// Function to get location ID
async function getLocationId(zipCode, authToken) {
    try {
        const response = await withTimeout(
            axios.get(`https://api.kroger.com/v1/locations?filter.zipCode.near=${zipCode}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            }),
            5000 // Timeout after 5 seconds
        );

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            throw new Error(`No location found for ZIP: ${zipCode}`);
        }

        return response;
    } catch (error) {
        console.error("Error fetching location ID:", error.response?.data || error.message);
        throw new Error("Failed to fetch location ID.");
    }
}

// Function to get products
async function getProducts(brand = '', searchTerm, location, authToken) {
    try {
        const locationId = location["locationId"];

        const response = await withTimeout(
            axios.get(`https://api.kroger.com/v1/products`, {
                params: {
                    "filter.term": searchTerm,
                    "filter.locationId": locationId,
                    ...(brand && { "filter.brand": brand }) // Only include brand if it's provided
                },
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            }),
            5000 // Timeout after 5 seconds
        );

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            console.warn("No products found for search term:", searchTerm);
            return [];
        }

        // Filter out products that are out of stock
        const availableProducts = response.data.data.filter(item =>
            item.items && item.items.some(subItem => subItem.inventory?.stockLevel !== "TEMPORARILY_OUT_OF_STOCK")
        );

        if (availableProducts.length === 0) {
            console.warn("No available (in-stock) products found.");
            return [];
        }

        // Sort by price (lowest first)
        availableProducts.sort((a, b) => {
            const priceA = a.items[0]?.price?.regular || Number.MAX_VALUE;
            const priceB = b.items[0]?.price?.regular || Number.MAX_VALUE;
            return priceA - priceB;
        });

        return availableProducts;
    } catch (error) {
        console.error("Error fetching products:", error.response?.data || error.message);
        throw new Error("Failed to fetch products.");
    }
}

// Main function to fetch products from Kroger
async function Krogers(zipCode = 47906, searchTerm, brand = '') {
    try {
        const token = await getAuthToken();
        if (!token) {
            throw new Error("Failed to obtain auth token.");
        }

        const location_data = await getLocationId(zipCode, token);
        const location = {
            "locationId": location_data.data.data[0].locationId,
            "name": location_data.data.data[0].name
        };

        if (!location) {
            throw new Error("No valid location found.");
        }

        const products = await getProducts(brand, searchTerm, location, token);
        return products.map(product => {
            const price = product.items?.[0]?.price?.regular || null;
            const unit = parseFloat(product.items?.[0]?.size?.split(" ")[0]) || null;
            const pricePerUnit = price && unit ? (price / unit).toFixed(2) : null;
            const item = product.items?.[0];
            const frontImage = product.images?.find(img => img.perspective === "front");
            const thumbnailUrl = frontImage?.sizes?.find(size => size.size === "thumbnail")?.url;

            return {
                id: item?.itemId,
                title: product.description || "",
                brand: product.brand || "",
                description: "",
                category: product.categories?.[0],
                price,
                unit: product.items?.[0]?.size || unit || "each",
                pricePerUnit,
                image_url: thumbnailUrl || null,
                location: product.location?.name || location.name,
            };
        });
    } catch (error) {
        console.error("Error in Krogers function:", error.message);
        throw new Error("Failed to fetch products from Kroger.");
    }
}

// Export for use as a module
module.exports = { Krogers };

// Run if called directly
if (require.main === module) {
  // Call Krogers and print result
  (async () => {
    try {
      const data = await Krogers(zipCode, searchTerm);
      console.log(JSON.stringify(data));
    } catch (err) {
      console.error(err);
    }
  })();
}