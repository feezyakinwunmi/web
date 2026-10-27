// web/src/lib/foodSafety.ts
// Ingredient/allergen checks for the vendor and admin dashboard. Mirrors the allergen
// rules in app/services/foodSafety.ts (keep the ALLERGENS list in sync).

export interface FoodInfo {
  name: string;
  description?: string | null;
  category?: string | null;
  ingredients?: string[] | null;
  health_tags?: string[] | null;
  allergens?: string[] | null;
}

export interface AllergenDef {
  id: string;
  label: string;
  icon: string;
  keywords: string[];
}

export const ALLERGENS: AllergenDef[] = [
  {
    id: 'contains_peanuts',
    label: 'Peanuts',
    icon: '🥜',
    keywords: ['peanut', 'groundnut', 'groundnut oil', 'kuli kuli', 'kulikuli', 'arachis', 'suya spice', 'yaji'],
  },
  {
    id: 'contains_nuts',
    label: 'Tree nuts',
    icon: '🌰',
    keywords: ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'brazil nut', 'tiger nut', 'nut butter', 'praline', 'marzipan', 'nuts'],
  },
  {
    id: 'contains_dairy',
    label: 'Dairy',
    icon: '🥛',
    keywords: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'lactose', 'wara', 'custard', 'ice cream', 'evaporated milk', 'condensed milk', 'milk powder', 'ghee', 'mozzarella', 'cheddar'],
  },
  {
    id: 'contains_eggs',
    label: 'Eggs',
    icon: '🥚',
    keywords: ['egg', 'egg white', 'egg yolk', 'mayonnaise', 'mayo', 'meringue', 'albumin'],
  },
  {
    id: 'contains_gluten',
    label: 'Gluten',
    icon: '🌾',
    keywords: ['wheat', 'flour', 'bread', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'indomie', 'semolina', 'semovita', 'couscous', 'barley', 'rye', 'oats', 'puff puff', 'chin chin', 'meat pie', 'doughnut', 'cake', 'biscuit', 'breadcrumb', 'wheat meal'],
  },
  {
    id: 'contains_shellfish',
    label: 'Shellfish',
    icon: '🦐',
    keywords: ['crayfish', 'shrimp', 'prawn', 'crab', 'lobster', 'periwinkle', 'isam', 'oyster', 'clam', 'mussel', 'scallop', 'snail', 'shellfish', 'seafood'],
  },
  {
    id: 'contains_fish',
    label: 'Fish',
    icon: '🐟',
    keywords: ['fish', 'stockfish', 'okporoko', 'panla', 'titus', 'mackerel', 'croaker', 'catfish', 'tilapia', 'sardine', 'tuna', 'salmon', 'cod', 'eja', 'smoked fish', 'dry fish', 'fish sauce', 'seafood'],
  },
  {
    id: 'contains_soy',
    label: 'Soy',
    icon: '🌱',
    keywords: ['soy', 'soya', 'soybean', 'soy sauce', 'tofu', 'awara', 'soy milk', 'miso', 'edamame'],
  },
  {
    id: 'contains_sesame',
    label: 'Sesame',
    icon: '⚪',
    keywords: ['sesame', 'beniseed', 'benne seed', 'tahini', 'sesame oil'],
  },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word (or whole-phrase) match, allowing simple plurals.
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return new RegExp(`(^|[^a-z])${escapeRegExp(t)}(s|es)?(?=[^a-z]|$)`, 'i').test(text);
}

export interface DetectedAllergen {
  allergen: AllergenDef;
  matches: string[];
}

export function detectAllergens(info: FoodInfo): DetectedAllergen[] {
  const text = [info.name, info.description, info.category, ...(info.ingredients || [])]
    .filter(Boolean)
    .join(' , ')
    .toLowerCase();
  const found: DetectedAllergen[] = [];
  for (const allergen of ALLERGENS) {
    const matches = allergen.keywords.filter(k => containsTerm(text, k));
    if (matches.length > 0) found.push({ allergen, matches });
  }
  return found;
}

export const allergenById = (id: string) => ALLERGENS.find(a => a.id === id);

export interface FoodReview {
  undeclaredAllergens: DetectedAllergen[];
  allAllergens: AllergenDef[];
  issues: string[];
}

// Admin review before approval: missing details and allergens found in the
// ingredients that the vendor did not declare.
export function reviewFood(info: FoodInfo): FoodReview {
  const declared = new Set([...(info.allergens || []), ...(info.health_tags || [])]);
  const detected = detectAllergens(info);
  const undeclaredAllergens = detected.filter(d => !declared.has(d.allergen.id));
  const allIds = new Set([...detected.map(d => d.allergen.id), ...declared]);
  const allAllergens = ALLERGENS.filter(a => allIds.has(a.id));

  const issues: string[] = [];
  if (!(info.ingredients || []).some(i => i.trim())) issues.push('No ingredients listed');
  if (!info.description?.trim()) issues.push('No description');
  for (const d of undeclaredAllergens) {
    issues.push(`${d.allergen.icon} ${d.allergen.label} not declared (found: ${d.matches.join(', ')})`);
  }
  return { undeclaredAllergens, allAllergens, issues };
}
