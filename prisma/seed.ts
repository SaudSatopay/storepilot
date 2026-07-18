import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SupplierSeed = {
  name: string;
  phone: string;
};

type CategorySeed = {
  category: string;
  prefix: string;
  supplier: string;
  priceRange: [number, number];
  demandRange: [number, number];
  reorderRange: [number, number];
  names: string[];
};

type ProductSeed = {
  sku: string;
  name: string;
  category: string;
  supplier: string;
  cost: Prisma.Decimal;
  price: Prisma.Decimal;
  reorderPoint: number;
  baseDemand: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_TO_SEED = 90;
const rng = mulberry32(20260718);

const suppliers: SupplierSeed[] = [
  { name: "Gulf Parts Supply", phone: "+966 55 010 4411" },
  { name: "Riyadh Mobile Wholesale", phone: "+966 55 011 2217" },
  { name: "Gulf Audio Traders", phone: "+966 55 012 8834" },
  { name: "Eastern Tech Distribution", phone: "+966 55 013 9042" },
  { name: "Skyline Networking", phone: "+966 55 014 7729" },
  { name: "Al Noor Electronics", phone: "+966 55 015 6088" },
];

const categories: CategorySeed[] = [
  {
    category: "Chargers",
    prefix: "CHG",
    supplier: "Gulf Parts Supply",
    priceRange: [29, 239],
    demandRange: [0.5, 3.1],
    reorderRange: [12, 32],
    names: [
      "Galaxy USB-C Charger 25W",
      "iPhone Fast Charger 20W",
      "Dual USB-C Wall Charger",
      "Travel GaN Charger 65W",
      "Laptop USB-C Charger 90W",
      "Car USB-C Charger",
      "Wireless Charging Pad",
      "Power Strip USB-C",
      "Compact USB-A Charger",
      "Multi-Port Desktop Charger",
      "MagSafe Style Charger",
      "Camera Battery Charger",
    ],
  },
  {
    category: "Cables",
    prefix: "CAB",
    supplier: "Gulf Parts Supply",
    priceRange: [12, 119],
    demandRange: [0.7, 3.6],
    reorderRange: [18, 40],
    names: [
      "Lightning Cable 1m",
      "USB-C Cable Braided 1m",
      "USB-C Cable Braided 2m",
      "HDMI Cable 2m",
      "HDMI Cable 5m",
      "DisplayPort Cable",
      "Ethernet Cable Cat6 3m",
      "AUX Cable 1m",
      "USB-C to HDMI Adapter",
      "USB-C Hub 6-in-1",
      "Micro USB Cable",
      "Cable Organizer Pack",
    ],
  },
  {
    category: "Phone Accessories",
    prefix: "ACC",
    supplier: "Riyadh Mobile Wholesale",
    priceRange: [9, 89],
    demandRange: [0.8, 4.2],
    reorderRange: [16, 42],
    names: [
      "Tempered Glass Screen Protector",
      "Clear Phone Case Medium",
      "Rugged Phone Case Large",
      "MagSafe Ring Stand",
      "Phone Tripod Mini",
      "Pop Grip Holder",
      "Camera Lens Protector",
      "Waterproof Phone Pouch",
      "SIM Ejector Tool Kit",
      "Phone Cleaning Kit",
      "Tablet Stand Foldable",
      "Car Phone Mount",
    ],
  },
  {
    category: "Audio",
    prefix: "AUD",
    supplier: "Gulf Audio Traders",
    priceRange: [19, 399],
    demandRange: [0.3, 2.4],
    reorderRange: [8, 24],
    names: [
      "Bluetooth Speaker Mini",
      "Wireless Earbuds Basic",
      "Wireless Earbuds Pro",
      "Wired Headset Classic",
      "Gaming Headset RGB",
      "USB Microphone Compact",
      "Noise Cancelling Headphones",
      "Neckband Earphones",
      "Desktop Speakers 2.0",
      "Portable Radio Speaker",
      "Lavalier Microphone",
      "Earbud Cleaning Kit",
    ],
  },
  {
    category: "Computer Accessories",
    prefix: "CMP",
    supplier: "Eastern Tech Distribution",
    priceRange: [19, 349],
    demandRange: [0.4, 2.8],
    reorderRange: [10, 28],
    names: [
      "Wireless Mouse Basic",
      "Wireless Mouse Ergonomic",
      "Bluetooth Mouse Slim",
      "Gaming Mouse RGB",
      "Wired Mouse Economy",
      "Mechanical Keyboard Blue Switch",
      "Wireless Keyboard Compact",
      "Keyboard and Mouse Combo",
      "Laptop Stand Aluminum",
      "Laptop Cooling Pad",
      "USB Numeric Keypad",
      "Mouse Pad Large",
    ],
  },
  {
    category: "Storage",
    prefix: "STO",
    supplier: "Eastern Tech Distribution",
    priceRange: [24, 699],
    demandRange: [0.2, 2.1],
    reorderRange: [8, 22],
    names: [
      "USB Flash Drive 32GB",
      "USB Flash Drive 64GB",
      "USB Flash Drive 128GB",
      "External SSD 512GB",
      "External SSD 1TB",
      "MicroSD Card 64GB",
      "MicroSD Card 128GB",
      "SD Card Reader",
      "Portable HDD 1TB",
      "NVMe Enclosure",
      "USB-C OTG Drive",
      "Backup Drive Case",
    ],
  },
  {
    category: "Networking",
    prefix: "NET",
    supplier: "Skyline Networking",
    priceRange: [29, 699],
    demandRange: [0.2, 1.6],
    reorderRange: [6, 18],
    names: [
      "Wi-Fi Router AC1200",
      "Wi-Fi Router AX1800",
      "Mesh Wi-Fi Node",
      "Range Extender Dual Band",
      "Ethernet Switch 5-Port",
      "Ethernet Switch 8-Port",
      "USB Wi-Fi Adapter",
      "Bluetooth USB Adapter",
      "LTE Hotspot Router",
      "Network Cable Tester",
      "Smart Plug Wi-Fi",
      "IP Camera Indoor",
    ],
  },
  {
    category: "Smart Home",
    prefix: "HOM",
    supplier: "Skyline Networking",
    priceRange: [19, 599],
    demandRange: [0.2, 1.8],
    reorderRange: [6, 20],
    names: [
      "Smart Bulb White",
      "Smart Bulb Color",
      "Smart Plug Mini",
      "Smart Door Sensor",
      "Smart Motion Sensor",
      "Smart IR Remote",
      "Video Doorbell Basic",
      "Security Camera Outdoor",
      "Smart LED Strip",
      "Smart Thermostat Basic",
      "Smart Lock Keypad",
      "Battery Pack for Sensors",
    ],
  },
  {
    category: "Laptops and Tablets",
    prefix: "LAP",
    supplier: "Al Noor Electronics",
    priceRange: [39, 1899],
    demandRange: [0.1, 1.3],
    reorderRange: [4, 14],
    names: [
      "Budget Android Tablet 8",
      "Student Tablet 10",
      "Drawing Tablet Small",
      "Laptop Sleeve 14",
      "Laptop Sleeve 15",
      "Laptop Charger Universal",
      "Chromebook 11 Demo Unit",
      "Refurbished Laptop i5",
      "USB-C Docking Station",
      "Tablet Keyboard Case",
      "Stylus Pen Active",
      "Privacy Screen 14",
    ],
  },
  {
    category: "Gaming and Repair",
    prefix: "GAM",
    supplier: "Al Noor Electronics",
    priceRange: [14, 499],
    demandRange: [0.2, 1.9],
    reorderRange: [6, 18],
    names: [
      "Game Controller Wireless",
      "Game Controller Wired",
      "Console HDMI Adapter",
      "RGB Light Strip",
      "Thermal Paste Pack",
      "Precision Screwdriver Kit",
      "Phone Repair Toolkit",
      "Screen Cleaning Spray",
      "Controller Charging Dock",
      "Webcam 1080p",
      "Streaming Ring Light",
      "Desk Cable Tray",
    ],
  },
];

const stockoutSkus = new Set(["CHG-001", "CAB-001"]);
const trendingDownSkus = new Set(["CMP-001", "AUD-001", "AUD-004"]);

async function main() {
  const today = startOfDay(new Date());
  const endDate = addDays(today, -1);
  const startDate = addDays(endDate, -(DAYS_TO_SEED - 1));
  const seasonalSpikeStartIndex = DAYS_TO_SEED - 31;
  const seasonalSpikeEndIndex = DAYS_TO_SEED - 24;
  const anomalyDate = addDays(endDate, -9);

  const catalog = buildCatalog();
  const salesBySku = new Map<string, { total: number; recent7: number; recent30: number }>();

  await prisma.$transaction([
    prisma.sale.deleteMany(),
    prisma.stockLevel.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.storeProfile.deleteMany(),
  ]);

  await prisma.storeProfile.create({
    data: {
      name: "Cedar Electronics",
      mode: "demo",
    },
  });

  const supplierRows = new Map<string, string>();
  for (const supplier of suppliers) {
    const row = await prisma.supplier.create({ data: supplier });
    supplierRows.set(row.name, row.id);
  }

  const productRows = new Map<string, { id: string; seed: ProductSeed }>();
  for (const seed of catalog) {
    const supplierId = supplierRows.get(seed.supplier);

    if (!supplierId) {
      throw new Error(`Missing supplier for ${seed.name}`);
    }

    const row = await prisma.product.create({
      data: {
        sku: seed.sku,
        name: seed.name,
        category: seed.category,
        cost: seed.cost,
        price: seed.price,
        reorderPoint: seed.reorderPoint,
        supplierId,
      },
    });

    productRows.set(seed.sku, { id: row.id, seed });
    salesBySku.set(seed.sku, { total: 0, recent7: 0, recent30: 0 });
  }

  const sales: Prisma.SaleCreateManyInput[] = [];

  for (let dayIndex = 0; dayIndex < DAYS_TO_SEED; dayIndex += 1) {
    const soldAt = addDays(startDate, dayIndex);
    const daysAgo = DAYS_TO_SEED - 1 - dayIndex;
    const dayFactor = weeklyFactor(soldAt);
    const isSeasonalSpike =
      dayIndex >= seasonalSpikeStartIndex && dayIndex <= seasonalSpikeEndIndex;
    const isAnomalyDay = isSameDay(soldAt, anomalyDate);

    for (const product of catalog) {
      const row = productRows.get(product.sku);

      if (!row) {
        throw new Error(`Missing product row for ${product.sku}`);
      }

      let expected = product.baseDemand * dayFactor * randomFloat(0.72, 1.28);

      if (
        isSeasonalSpike &&
        ["Laptops and Tablets", "Computer Accessories", "Storage"].includes(
          product.category,
        )
      ) {
        expected *= 1.65;
      }

      if (trendingDownSkus.has(product.sku)) {
        const trendProgress = dayIndex / (DAYS_TO_SEED - 1);
        expected *= 1.35 - trendProgress * 0.88;
      }

      if (isAnomalyDay && product.category === "Phone Accessories") {
        expected *= 3.8;
      }

      if (stockoutSkus.has(product.sku) && daysAgo <= 12) {
        expected *= 1.55;
      }

      let qty = samplePoisson(expected);

      if (isAnomalyDay && product.sku === "ACC-001") {
        qty += 31;
      }

      if (qty <= 0) {
        continue;
      }

      const discount = rng() < 0.12 ? randomFloat(0.9, 0.97) : 1;
      const unitPrice = money(Number(product.price) * discount);

      sales.push({
        productId: row.id,
        qty,
        unitPrice,
        soldAt: addHours(soldAt, randomInt(10, 21)),
      });

      const stats = salesBySku.get(product.sku);

      if (!stats) {
        throw new Error(`Missing sales stats for ${product.sku}`);
      }

      stats.total += qty;
      if (daysAgo < 7) {
        stats.recent7 += qty;
      }
      if (daysAgo < 30) {
        stats.recent30 += qty;
      }
    }
  }

  await prisma.sale.createMany({ data: sales });

  const stockLevels = catalog.map((product) => {
    const row = productRows.get(product.sku);
    const stats = salesBySku.get(product.sku);

    if (!row || !stats) {
      throw new Error(`Missing stock data for ${product.sku}`);
    }

    const recentDailyVelocity = Math.max(stats.recent30 / 30, 0.1);
    let qty = Math.ceil(
      product.reorderPoint + recentDailyVelocity * randomInt(14, 40) + randomInt(0, 18),
    );

    if (stockoutSkus.has(product.sku)) {
      qty = Math.max(2, Math.ceil(Math.max(stats.recent7 / 7, 1) * 2.4));
    }

    if (trendingDownSkus.has(product.sku)) {
      qty += randomInt(36, 72);
    }

    return {
      productId: row.id,
      qty,
      updatedAt: addHours(today, 8),
    };
  });

  await prisma.stockLevel.createMany({ data: stockLevels });

  const counts = {
    suppliers: await prisma.supplier.count(),
    products: await prisma.product.count(),
    sales: await prisma.sale.count(),
    stockLevels: await prisma.stockLevel.count(),
  };

  console.log(
    `Seeded ${counts.products} products, ${counts.suppliers} suppliers, ${counts.stockLevels} stock levels, and ${counts.sales} sales rows for Cedar Electronics.`,
  );
}

function buildCatalog(): ProductSeed[] {
  return categories.flatMap((category) =>
    category.names.map((name, index) => {
      const sku = `${category.prefix}-${String(index + 1).padStart(3, "0")}`;
      const price = priceForProduct(category, sku);
      const cost = money(price * randomFloat(0.52, 0.72));
      const reorderPoint = reorderPointForProduct(category, sku);
      const baseDemand = baseDemandForProduct(category, sku);

      return {
        sku,
        name,
        category: category.category,
        supplier: category.supplier,
        cost,
        price: money(price),
        reorderPoint,
        baseDemand,
      };
    }),
  );
}

function priceForProduct(category: CategorySeed, sku: string) {
  const [min, max] = category.priceRange;
  const specialPrices: Record<string, number> = {
    "CHG-001": 65,
    "CAB-001": 39,
    "CMP-001": 49,
    "AUD-001": 89,
    "AUD-004": 55,
    "ACC-001": 19,
  };

  return specialPrices[sku] ?? randomInt(min, max);
}

function reorderPointForProduct(category: CategorySeed, sku: string) {
  const specialReorderPoints: Record<string, number> = {
    "CHG-001": 30,
    "CAB-001": 34,
    "CMP-001": 18,
    "AUD-001": 16,
    "AUD-004": 18,
  };

  if (specialReorderPoints[sku]) {
    return specialReorderPoints[sku];
  }

  const [min, max] = category.reorderRange;
  return randomInt(min, max);
}

function baseDemandForProduct(category: CategorySeed, sku: string) {
  const specialDemand: Record<string, number> = {
    "CHG-001": 2.8,
    "CAB-001": 3.4,
    "CMP-001": 1.9,
    "AUD-001": 1.5,
    "AUD-004": 1.7,
    "ACC-001": 3.6,
  };

  if (specialDemand[sku]) {
    return specialDemand[sku];
  }

  const [min, max] = category.demandRange;
  return randomFloat(min, max);
}

function weeklyFactor(date: Date) {
  const day = date.getDay();
  const factors = [0.72, 0.88, 0.96, 1.02, 1.08, 1.34, 1.26];
  return factors[day] ?? 1;
}

function samplePoisson(lambda: number) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count += 1;
    product *= rng();
  } while (product > limit);

  return count - 1;
}

function randomFloat(min: number, max: number) {
  return min + (max - min) * rng();
}

function randomInt(min: number, max: number) {
  return Math.floor(randomFloat(min, max + 1));
}

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(hours, randomInt(0, 55), 0, 0);
  return next;
}

function isSameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
