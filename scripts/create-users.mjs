// Creates Supabase Auth users (profiles are auto-created by the handle_new_user trigger).
// Usage:
//   node scripts/create-users.mjs            -> dry run: prints names/emails, creates nothing
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-users.mjs --apply
// The service role key never goes in the repo. Credentials are written OUTSIDE the repo.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? "shout.com";
const CREDENTIALS_OUT = process.env.CREDENTIALS_OUT ?? "C:/Users/Admin/Desktop/oas-credentials.csv";
const APPLY = process.argv.includes("--apply");

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");
const env = Object.fromEntries(
  existsSync(envPath)
    ? readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => l.split(/=(.*)/s).slice(0, 2))
    : [],
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;

// Names exactly as provided. Department/role are not in the list, so defaults apply (receiver / Unassigned).
const NAMES = `KRISTINE JOY M. ROQUE
VINCENT EDRIEL ESCOTON
RADCER J. ABDUHADI
EPEARL GRACE JEAN L. ROSAL
FRITZIE MAE P. CHUA
DANIEL N. MENCIAS JR.
DIONNE MARKO N. LAGROSAS
ROGINE CLAIRE Q. LOMOCSO
SARAH JANE M. PADILLA
JANETH V. QUILO
JOSEPH D. CUANAN JR.
RENAJEN U. SALDUA
LUCILA B. OCAMPO
THEJAY MAY B. TAGALOGON
AIZA W. MANGALIWAN
SEAN KLYDE MIKHEL B. MACUA
RYCYL C. PANDAN
JENNIFER T. BALEÑA
CYD G. TROCIO
FRETZEL UN L. GUBANTES
CRISTEL KATE E. TAOTJO
JENIE ROSE M. LIMOCON
ROSELLE L. ABELLANOSA
JAMAICA B. VALE
CRISANTO II C. LEGASPI
MARIVIC B. ABERGONZADO
JILLIAN M. SEGOVIA
JUSTINE JADE S. TUICO
CHERRY MAE B. TRUZ
REESE E. CAÑO
KAYE L. de GUMA
GREGORIO III T. MENCIAS
KYLA SHANE B. PEÑANUEVA
MARY JOY R. MONTERO
HANNAH MAE O. DELA CRUZ
SOTERO PAOLO D. GRECIA
CRIZIEL JEAN C. TEDERA
JULIE ANN T. SAYAGO
DANICA C. MAWALIC
CHARMAINE R. TUMBIGA
MA. ANGELINE P. OWANO
QUENNIE P. LOBERIZA
MYTHA T. ESCOBAÑEZ
LIMAR DAVE A. CABALUD
ANGELINE A. GAPAS
LYKA B. TABANAO
MA. DEDREY R. BAUTISTA
JAMAICOH P. VALMONTE
CRIEZEL KYLE O. RIVERA
JOVY L. SANTOS
FRETZIE LORRAINE D. PORCELO
SUZETTE MAE S. VICENTE
NORHAISA P. DIMAUDTANG
NHERMIN T. SILONGAN
ROVELIO G. ORANTE
JAMAICAH C. LOVINO
JERRY MAE P. MENDOZA
KRYZELLE DANE B. JAMBOY`.split("\n");

// Memorable password: 3 words + 4 digits, e.g. "Maple-Tiger-River-4821". ~31 bits, easy to say and type.
const WORDS = `apple basil birch bison cedar cloud coral dune eagle ember fern finch flame frost garden glow harbor hazel heron ivory jade juniper kite lake lark lemon lilac maple marble meadow mint moon oak olive orchid otter palm pearl pine plum pebble quartz rain raven river rose sage salmon sand shell silver sky sparrow spruce stone storm sun tiger tulip valley violet wave willow wind amber aster bloom brook canyon comet crane delta falcon glade`.split(" ");
const pick = () => WORDS[randomInt(WORDS.length)];
const makePassword = () =>
  `${pick()}-${pick()}-${pick()}-${String(randomInt(10000)).padStart(4, "0")}`;

// Email rule: firstname@DOMAIN, using the first given name ("MA." is skipped as a prefix).
// Collisions: two people named Angeline. Owano gets her middle initial.
const EMAIL_OVERRIDES = { "MA. ANGELINE P. OWANO": `angeline.p@${EMAIL_DOMAIN}` };

function makeEmail(fullName) {
  if (EMAIL_OVERRIDES[fullName]) return EMAIL_OVERRIDES[fullName];
  const parts = fullName.replace(/\./g, "").split(/\s+/).filter(Boolean);
  const given = parts[0].toUpperCase() === "MA" ? parts[1] : parts[0];
  const first = given.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "n");
  return `${first}@${EMAIL_DOMAIN}`;
}

const people = NAMES.map((full_name) => ({
  full_name: full_name.trim(),
  email: makeEmail(full_name.trim()),
  password: makePassword(),
}));

if (!APPLY) {
  console.log("DRY RUN (no accounts created). Review emails:");
  for (const p of people) console.log(`${p.full_name}\t${p.email}`);
  console.log(`\n${people.length} people. Re-run with --apply and SUPABASE_SERVICE_ROLE_KEY set.`);
  process.exit(0);
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !key) throw new Error("Missing VITE_SUPABASE_URL in .env or SUPABASE_SERVICE_ROLE_KEY");

const rows = ["full_name,email,password,status"];
// Write each row as it's produced, so a locked file or crash never loses passwords.
// If the default file is locked (e.g. open in an editor), a timestamped file is used instead.
let OUT = CREDENTIALS_OUT;
const csv = (cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\r\n";
try {
  writeFileSync(OUT, "\uFEFF" + csv(["full_name", "email", "password", "status"]), "utf8");
} catch {
  OUT = CREDENTIALS_OUT.replace(/\.csv$/, `-${Date.now()}.csv`);
  writeFileSync(OUT, "\uFEFF" + csv(["full_name", "email", "password", "status"]), "utf8");
}
const append = (row) => appendFileSync(OUT, csv(row), "utf8");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// If the account already exists, find its id via profiles and reset the password instead.
async function resetExisting(email, password) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`, { headers });
  const [row] = await r.json();
  if (!row) return "failed: exists but no profile found";
  const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${row.id}`, {
    method: "PUT", headers, body: JSON.stringify({ password }),
  });
  return u.ok ? "password reset" : `failed: reset ${u.status}`;
}

for (const p of people) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name, department: "Unassigned" },
    }),
  });
  const body = await res.json().catch(() => ({}));
  let status = res.ok ? "created" : (body.msg ?? body.message ?? "").toLowerCase().includes("already")
    ? await resetExisting(p.email, p.password)
    : `failed: ${body.msg ?? body.message ?? res.status}`;
  append([p.full_name, p.email, p.password, status]);
  console.log(`${status.padEnd(16)} ${p.email}`);
}

console.log(`\nCredentials saved to ${OUT} (outside the repo). Keep it private.`);
