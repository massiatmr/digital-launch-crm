/** Pure greeting rules shared by browser and WhatsApp functions. Never mutate contact data. */
export function resolveGreetingName(name?: string | null, companyName?: string | null): string | null {
  const raw = (name || "").normalize("NFC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  const comparable = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!raw || /^(prospect|lead|contact|client|inconnu|unknown|whatsapp|messenger|instagram|user|utilisateur|test)(?:\s*\d+)?$/i.test(raw)) return null;
  if (!/\p{L}/u.test(raw) || /@|https?:|\d{3,}/i.test(raw)) return null;
  if (companyName && comparable(raw) === comparable(companyName)) return null;
  if (/(?:^|[\s.,&-])(?:sarl|eurl|sas|sasu|llc|inc|ltd|gmbh|ets|entreprise|société|societe|company|services?|construction|renovation|rénovation|déménagement|demenagement|immobilier|agency|agence|solutions?|studio|boutique|restaurant|decowork|شركة|مؤسسة|مقاولات)(?:$|[\s.,&-])/iu.test(raw) || /&|\bet fils\b/i.test(raw)) return null;
  const tokens = raw.replace(/^(?:m\.?|mr\.?|mme|madame|monsieur|dr\.?)\s+/i, "").split(/\s+|\s*[|/()]\s*/u).filter(Boolean);
  const first = tokens[0]?.replace(/^[^\p{L}]+|[^\p{L}'’\-]+$/gu, "") || "";
  if (!first || [...first].length < 2) return null;
  const next = tokens[1];
  if (next && /^\p{Script=Arabic}+$/u.test(first) && /^\p{Script=Arabic}+$/u.test(next)) {
    if (/^(عبد|أبو|ابو|أبي|ابي|سيدي)$/u.test(first) || (/^(نور|صلاح|سيف|زين)$/u.test(first) && /^(الدين|دين)$/u.test(next))) return `${first} ${next}`;
  }
  if (next && /^(abdel|abd|abdul)$/i.test(first) && /^\p{Script=Latin}[\p{Script=Latin}'’-]*$/u.test(next)) return `${first} ${next}`;
  return first;
}

// Approved Meta templates require nonempty parameters; a neutral addressee is not a fabricated name.
export function templateGreetingName(name?: string | null, companyName?: string | null, body = ""): string {
  return resolveGreetingName(name, companyName) || (/[\p{Script=Arabic}]/u.test(body) && !/[a-z]/i.test(body) ? "بكم" : "à vous");
}

export function renderNameTemplate(content: string, name?: string | null, companyName?: string | null): string {
  const greeting = resolveGreetingName(name, companyName) || "";
  return content.replace(/\{\{\s*name\s*\}\}/gi, greeting)
    .replace(/(bonjour|salut|hello|bonsoir)[ \t]+([,!.?])/gi, "$1$2")
    .replace(/(bonjour|salut|hello|bonsoir)[ \t]+(?=\n|$)/gi, "$1");
}

export function greetingInstructions(name?: string | null, companyName?: string | null): string {
  const greeting = resolveGreetingName(name, companyName);
  return greeting
    ? `NOM DE SALUTATION AUTORISÉ : « ${greeting} ». Utilise uniquement cette forme courte pour t'adresser au contact. Conserve exactement son écriture et ses accents, sans traduction ni translittération, sans ajouter le nom de famille ni répéter le nom dans un autre alphabet.`
    : `AUCUN PRÉNOM PERSONNEL FIABLE : nom de société, absent ou ambigu. Utilise une salutation neutre sans prénom (Bonjour / مرحبا selon la langue). N'invente aucun nom et ne salue pas une société comme une personne. Pour une variable de nom obligatoire dans un modèle français, utilise « à vous », pas le nom de société.`;
}

export function normalizeTemplateNameVariables(body: string, values: unknown[], name?: string | null, companyName?: string | null): string[] {
  return values.map((value, index) => {
    const text = String(value ?? "").trim();
    const slot = String(index + 1);
    const greetingSlot = new RegExp(`(?:bonjour|bonsoir|salut|hello|cher|chère|مرحبا|مرحباً|السلام عليكم)\\s*[,،]?\\s*\\{\\{\\s*${slot}\\s*\\}\\}`, "iu").test(body);
    const exactName = !!name?.trim() && text === name.trim();
    return greetingSlot || exactName ? templateGreetingName(name, companyName, body) : text;
  });
}