const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

function readKey(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const line = lines.find((item) => item.startsWith("STRIPE_SECRET_KEY="));
  return line ? line.slice("STRIPE_SECRET_KEY=".length).trim() : "";
}

async function check(label, key) {
  if (!key) {
    return { label, ok: false, reason: "EMPTY" };
  }
  try {
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    await stripe.balance.retrieve();
    return { label, ok: true, prefix: key.slice(0, 12), suffix: key.slice(-4) };
  } catch (error) {
    return { label, ok: false, prefix: key.slice(0, 12), suffix: key.slice(-4), reason: error.message };
  }
}

(async () => {
  const rootKey = readKey(path.join(process.cwd(), ".env"));
  const apiKey = readKey(path.join(process.cwd(), "apps/api/.env"));
  const results = [];
  results.push(await check("root", rootKey));
  results.push(await check("apps-api", apiKey));
  console.log(JSON.stringify(results, null, 2));
})();
