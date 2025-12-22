import { db, client } from "./index";
import { investmentMethods } from "./schema";

async function seed() {
  console.log("🌱 Starting database seed...");

  try {
    // Seed Investment Methods
    console.log("📦 Seeding investment methods...");
    
    await db.insert(investmentMethods).values({
      name: 'Safe Investment',
      description: 'A low-risk method ideal for conservative investors.',
      author: 'Humexxx',
      riskLevel: 'Low',
      monthlyRoi: 0.7
    }).onConflictDoNothing();

    console.log("  ✓ Investment Method created");

    console.log("\n✅ Database seed completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}

seed()
  .then(async () => {
    console.log("✨ Seed process finished");
    await client.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("💥 Seed process failed:", error);
    await client.end();
    process.exit(1);
  });
