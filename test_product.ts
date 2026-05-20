import { prisma } from "./src/lib/prisma";

async function main() {
  try {
    const res = await fetch("http://192.168.1.141:6060/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Test Product",
        sku: "TEST-SKU-1",
        sellingPrice: 10.5,
        costPrice: 5.0,
        stockQuantity: 100,
        categoryName: "Snacks"
      })
    });
    
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
  } catch (err) {
    console.error(err);
  }
}

main();
