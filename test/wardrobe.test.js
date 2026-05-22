import assert from "node:assert/strict";
import test from "node:test";
import { brands, categories, seedGarments } from "../src/data.js";
import {
  addCareLog,
  createCareLog,
  createOutfit,
  filterGarments,
  getStats,
  getCareCount,
  getCostPerWear,
  getLastCare,
  getLastWorn,
  getTimelineEvents,
  getWearCount,
  groupBrandsWithCounts,
  listBrandRegistry,
  normalizeBrand,
  parseWardrobeBackup,
  parseWardrobeImport,
  recordOutfitWear,
  recordWear,
  serializeWardrobe,
  sortGarments,
  topEntries,
  validateCareLog,
  validateOutfit,
  validateGarment
} from "../src/wardrobe.js";

test("normalizes brand aliases and casing to the standard brand record", () => {
  assert.equal(normalizeBrand("YSL")?.nameEn, "Saint Laurent");
  assert.equal(normalizeBrand("slp")?.nameEn, "Saint Laurent");
  assert.equal(normalizeBrand("PRADA")?.nameEn, "Prada");
  assert.equal(normalizeBrand("Chloe")?.nameEn, "Chloé");
});

test("rejects garments whose subcategory does not belong to the selected master category", () => {
  const errors = validateGarment({
    brandId: "loewe",
    categoryLevel1: "Bags",
    categoryLevel2: "Blazers",
    colors: ["Black"],
    status: "InCloset"
  });

  assert.equal(errors.categoryLevel2, "请选择对应二级品类");
});

test("accepts a garment using a valid brand and category tree pair", () => {
  const errors = validateGarment({
    brandId: "loewe",
    categoryLevel1: "Bags",
    categoryLevel2: "ShoulderBags",
    colors: ["Tan"],
    status: "InCloset"
  });

  assert.deepEqual(errors, {});
});

test("filters by standardized brand and Mytheresa-style category together", () => {
  const result = filterGarments(seedGarments, {
    brandId: "toteme",
    categoryLevel1: "TopsAndOuterwear"
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].categoryLevel2, "Blazers");
});

test("hides donated and discarded garments by default", () => {
  const garments = [
    ...seedGarments,
    {
      ...seedGarments[0],
      id: "archived",
      status: "Donated"
    }
  ];

  assert.equal(filterGarments(garments, {}).some((garment) => garment.id === "archived"), false);
  assert.equal(filterGarments(garments, { showArchived: true }).some((garment) => garment.id === "archived"), true);
});

test("search matches brand aliases, category names, tags, and notes", () => {
  assert.equal(filterGarments(seedGarments, { query: "YSL", showArchived: true }).length, 1);
  assert.equal(filterGarments(seedGarments, { query: "包包", showArchived: true }).length, 1);
  assert.equal(filterGarments(seedGarments, { query: "通勤", showArchived: true }).length, 1);
  assert.equal(filterGarments(seedGarments, { query: "高跟鞋", showArchived: true }).length, 1);
});

test("calculates overview stats and ignores archived items", () => {
  const garments = [
    ...seedGarments,
    {
      ...seedGarments[1],
      id: "discarded",
      status: "Discarded",
      purchasePrice: 100000
    }
  ];
  const stats = getStats(garments);

  assert.equal(stats.total, 3);
  assert.equal(stats.statusCounts.InCloset, 2);
  assert.equal(stats.statusCounts.Laundry, 1);
  assert.equal(stats.priceTotal, 36900);
  assert.equal(stats.colorCounts.Black, 2);
  assert.equal(stats.colorCounts.Tan, 1);
});

test("price stats ignore garments with empty purchase prices", () => {
  const stats = getStats([
    {
      ...seedGarments[0],
      id: "priced",
      purchasePrice: 100
    },
    {
      ...seedGarments[1],
      id: "empty",
      purchasePrice: null
    }
  ]);

  assert.equal(stats.priceTotal, 100);
  assert.equal(stats.averagePrice, 100);
});

test("sorts garments by price and brand", () => {
  assert.deepEqual(
    sortGarments(seedGarments, "priceDesc").map((garment) => garment.id),
    ["g-2", "g-3", "g-1"]
  );
  assert.deepEqual(
    sortGarments(seedGarments, "brandAz").map((garment) => garment.brandId),
    ["loewe", "saint-laurent", "toteme"]
  );
});

test("returns top count entries in descending order with stable tie sorting", () => {
  assert.deepEqual(topEntries({ C: 1, A: 2, B: 2 }, 2), [
    ["A", 2],
    ["B", 2]
  ]);
});

test("records garment wear dates once per day and calculates cost per wear", () => {
  const garment = {
    ...seedGarments[0],
    purchasePrice: 900,
    wearDates: ["2026-05-01"]
  };
  const wornAgain = recordWear(garment, "2026-05-01");
  const wornNewDay = recordWear(wornAgain, "2026-05-02");

  assert.equal(getWearCount(wornAgain), 1);
  assert.equal(getWearCount(wornNewDay), 2);
  assert.equal(getLastWorn(wornNewDay), "2026-05-02");
  assert.equal(getCostPerWear(wornNewDay), 450);
});

test("records wear for every garment in an outfit without duplicate same-day wears", () => {
  const outfit = {
    id: "outfit",
    name: "职场黑色线条",
    garmentIds: ["g-1", "g-3"]
  };
  const worn = recordOutfitWear(seedGarments, outfit, "2026-05-20");
  const wornAgain = recordOutfitWear(worn, outfit, "2026-05-20");

  assert.deepEqual(worn.map((garment) => garment.wearDates || []), [["2026-05-20"], [], ["2026-05-20"]]);
  assert.deepEqual(wornAgain.map((garment) => garment.wearDates || []), [["2026-05-20"], [], ["2026-05-20"]]);
});

test("adds garment care logs and reports the latest care record", () => {
  const cared = addCareLog(seedGarments[0], {
    type: "Cleaning",
    date: "2026-05-10",
    notes: "Dry clean"
  });
  const caredAgain = addCareLog(cared, {
    type: "Repair",
    date: "2026-05-12",
    notes: "Button"
  });

  assert.equal(getCareCount(caredAgain), 2);
  assert.equal(getLastCare(caredAgain).type, "Repair");
  assert.equal(createCareLog({ type: "Storage", date: "2026-05-01" }).type, "Storage");
});

test("validates care logs against existing garments", () => {
  assert.deepEqual(validateCareLog({ garmentId: "g-1", type: "Cleaning", date: "2026-05-10" }, seedGarments), {});
  assert.equal(validateCareLog({ garmentId: "missing", type: "Cleaning", date: "2026-05-10" }, seedGarments).garmentId, "请选择衣物");
  assert.equal(validateCareLog({ garmentId: "g-1", type: "", date: "2026-05-10" }, seedGarments).type, "请选择保养类型");
  assert.equal(validateCareLog({ garmentId: "g-1", type: "Cleaning", date: "" }, seedGarments).date, "请选择日期");
});

test("builds a combined timeline from wear and care records", () => {
  const garments = [
    addCareLog(
      {
        ...seedGarments[0],
        wearDates: ["2026-05-01", "2026-05-03"]
      },
      { type: "Cleaning", date: "2026-05-02", notes: "Dry clean" }
    )
  ];

  const events = getTimelineEvents(garments);
  assert.deepEqual(
    events.map((event) => [event.type, event.date]),
    [
      ["wear", "2026-05-03"],
      ["care", "2026-05-02"],
      ["wear", "2026-05-01"]
    ]
  );
  assert.equal(getTimelineEvents(garments, { type: "care" }).length, 1);
});

test("import normalizes missing wear dates to an empty array", () => {
  const imported = parseWardrobeImport(serializeWardrobe(seedGarments));
  assert.deepEqual(imported[0].wearDates, []);
});

test("validates and creates outfit sets from existing garments", () => {
  const errors = validateOutfit(
    {
      name: "晚宴黑色线条",
      occasion: "晚宴",
      garmentIds: ["g-1", "g-3"]
    },
    seedGarments
  );
  assert.deepEqual(errors, {});

  const outfit = createOutfit({
    name: " 晚宴黑色线条 ",
    occasion: "晚宴",
    garmentIds: ["g-1", "g-1", "g-3"],
    notes: "正式场合"
  });
  assert.equal(outfit.name, "晚宴黑色线条");
  assert.deepEqual(outfit.garmentIds, ["g-1", "g-3"]);
});

test("serializes and parses wardrobe backups with outfits", () => {
  const exported = serializeWardrobe(seedGarments, [
    {
      id: "outfit",
      name: "周末",
      occasion: "周末",
      garmentIds: ["g-2"],
      notes: "",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    }
  ]);
  const backup = parseWardrobeBackup(exported);

  assert.equal(backup.garments.length, seedGarments.length);
  assert.equal(backup.outfits.length, 1);
  assert.equal(backup.outfits[0].garmentIds[0], "g-2");
});

test("rejects outfits with missing or unknown garments", () => {
  assert.equal(validateOutfit({ name: "", garmentIds: ["g-1"] }, seedGarments).name, "请输入穿搭名称");
  assert.equal(validateOutfit({ name: "空集合", garmentIds: [] }, seedGarments).garmentIds, "至少选择一件衣物");
  assert.equal(validateOutfit({ name: "错误集合", garmentIds: ["missing"] }, seedGarments).garmentIds, "穿搭中包含不存在的衣物");
});

test("brand wall groups active owned garments alphabetically with counts", () => {
  const grouped = groupBrandsWithCounts(seedGarments, brands);
  assert.deepEqual(
    grouped.map((brand) => [brand.nameEn, brand.count]),
    [
      ["Loewe", 1],
      ["Saint Laurent", 1],
      ["Toteme", 1]
    ]
  );
});

test("brand registry lists all standard brands and supports alias search", () => {
  const result = listBrandRegistry(seedGarments, { query: "YSL" });
  assert.equal(result.length, 1);
  assert.equal(result[0].nameEn, "Saint Laurent");
  assert.equal(result[0].count, 1);

  const letterResult = listBrandRegistry(seedGarments, { letter: "M" });
  assert.deepEqual(
    letterResult.map((brand) => brand.nameEn),
    ["Mach & Mach", "Magda Butrym", "Maison Margiela", "Manolo Blahnik", "Max Mara", "Missoni Casa", "Miu Miu", "Moncler", "Mugler"]
  );
});

test("serializes and parses wardrobe backup files", () => {
  const exported = serializeWardrobe(seedGarments);
  const imported = parseWardrobeImport(exported);

  assert.equal(imported.length, seedGarments.length);
  assert.equal(imported[0].brandId, seedGarments[0].brandId);
});

test("rejects invalid imported wardrobe data", () => {
  assert.throws(() => parseWardrobeImport("{bad json"), /有效的 JSON/);
  assert.throws(() => parseWardrobeImport(JSON.stringify({ garments: [{ brandId: "unknown" }] })), /第 1 件衣物无效/);
});

test("category seed data contains required master categories", () => {
  assert.deepEqual(
    categories.map((category) => category.code),
    ["TopsAndOuterwear", "DressesAndSkirts", "PantsAndDenim", "Bags", "Shoes"]
  );
});
