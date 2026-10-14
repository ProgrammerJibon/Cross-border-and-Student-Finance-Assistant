import bcrypt from "bcryptjs";
import sharp from "sharp";

// Add once. Later Admin edits, suspension and unpublishing remain untouched.
export async function seedDemoTeam(db) {
  if (process.env.DEMO_MODE !== "true") return;
  const [done] = await db.execute(
    "SELECT id FROM platform_migrations WHERE id='demo-team-v1'",
  );
  if (done.length) return;
  const members = [
    [
      "amina",
      "Amina Rahman (Demo)",
      "Leadership",
      "Chief Executive Officer",
      "AR",
      "#174a44",
      ["reports", "team"],
    ],
    [
      "li",
      "Li Wei (Demo)",
      "Engineering",
      "Head of Engineering",
      "LW",
      "#385a87",
      ["agent", "models"],
    ],
    [
      "sadia",
      "Sadia Ahmed (Demo)",
      "Student Experience",
      "Student Support Lead",
      "SA",
      "#896049",
      ["users", "reports"],
    ],
    [
      "chen",
      "Chen Lin (Demo)",
      "Finance Operations",
      "Finance Operations Lead",
      "CL",
      "#6a598b",
      ["finance", "catalog"],
    ],
  ];
  const hash = await bcrypt.hash("DemoOnly!2026", 12);
  await db.beginTransaction();
  try {
    for (const [
      index,
      [slug, name, department, designation, initials, color, permissions],
    ] of members.entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="${color}"/><circle cx="400" cy="20" r="140" fill="white" opacity=".08"/><circle cx="240" cy="119" r="51" fill="#e6c3a8"/><path d="M187 108c0-78 115-78 106 8-25-10-44-20-65-40-11 19-23 28-41 32" fill="#263536"/><path d="M129 300v-35c0-88 222-88 222 0v35" fill="#d6e4df"/><path d="M202 220l38 42 38-42" fill="#abc6bd"/><text x="26" y="42" font-family="Arial,sans-serif" font-size="22" fill="white">${initials}</text><text x="26" y="299" font-family="Arial,sans-serif" font-size="13" letter-spacing="2" fill="${color}">DEMO PROFILE</text></svg>`;
      const avatar = `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
      const id = `demo-team-${slug}`;
      await db.execute(
        "INSERT IGNORE INTO users(id,name,email,password_hash,role,avatar,admin_permissions,onboarded,is_demo) VALUES (?,?,?,?,'MODERATOR',?,?,1,1)",
        [
          id,
          name,
          `${slug}@example.com`,
          hash,
          avatar,
          JSON.stringify(permissions),
        ],
      );
      await db.execute(
        "INSERT IGNORE INTO user_preferences(user_id,preferred_currency,country_code) VALUES (?,'CNY','CN')",
        [id],
      );
      await db.execute(
        "INSERT IGNORE INTO team_members(user_id,department,designation,phone,portfolio,is_ceo,published,display_order) VALUES (?,?,?,?,?,?,1,?)",
        [
          id,
          department,
          designation,
          `+1 202-555-01${String(index).padStart(2, "0")}`,
          `https://example.com/team/${slug}`,
          index === 0,
          index,
        ],
      );
    }
    await db.execute(
      "INSERT INTO platform_migrations(id) VALUES ('demo-team-v1')",
    );
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
