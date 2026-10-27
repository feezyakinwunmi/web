// web/src/lib/dishTemplates.ts (copy of app/services/dishTemplates.ts — keep in sync)
// Typical ingredients for common Nigerian dishes so vendors can fill a listing in one
// tap. Used instantly on-device; the suggest-dish-info edge function (AI) covers
// anything not listed here.
import { containsTerm } from './foodSafety';

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DishTemplate {
  match: string[];
  ingredients: string[];
  mealTimes: MealTime[];
  healthTags?: string[];
  description: string;
}

const STEW_BASE = ['tomato', 'tatashe pepper', 'scotch bonnet pepper', 'onion', 'vegetable oil', 'seasoning cube', 'salt'];

export const DISH_TEMPLATES: DishTemplate[] = [
  { match: ['jollof rice', 'jollof'], ingredients: ['rice', ...STEW_BASE, 'curry powder', 'thyme', 'bay leaf'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb', 'spicy'], description: 'Smoky party-style jollof rice cooked in a rich tomato and pepper base.' },
  { match: ['fried rice'], ingredients: ['rice', 'carrot', 'green beans', 'sweet corn', 'green peas', 'liver', 'onion', 'curry powder', 'vegetable oil', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Nigerian-style fried rice tossed with mixed vegetables and curry.' },
  { match: ['coconut rice'], ingredients: ['rice', 'coconut milk', 'tomato', 'pepper', 'onion', 'crayfish', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Fragrant rice cooked in coconut milk with peppers and crayfish.' },
  { match: ['ofada rice', 'ofada', 'ayamase', 'designer stew'], ingredients: ['ofada rice', 'green bell pepper', 'scotch bonnet pepper', 'locust beans', 'palm oil', 'assorted meat', 'boiled egg', 'onion'], mealTimes: ['lunch', 'dinner'], healthTags: ['spicy', 'high_fat'], description: 'Local ofada rice served with spicy green pepper ayamase stew and assorted meat.' },
  { match: ['white rice and stew', 'rice and stew', 'white rice'], ingredients: ['rice', ...STEW_BASE, 'beef'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Fluffy white rice served with Nigerian tomato stew.' },
  { match: ['egusi'], ingredients: ['egusi (melon seeds)', 'palm oil', 'spinach', 'crayfish', 'stockfish', 'beef', 'pepper', 'onion', 'locust beans', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Rich egusi soup with leafy greens, meat and stockfish.' },
  { match: ['ogbono'], ingredients: ['ogbono seeds', 'palm oil', 'crayfish', 'stockfish', 'beef', 'pepper', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Thick, draw ogbono soup cooked with palm oil, meat and fish.' },
  { match: ['okro soup', 'okra soup', 'okro', 'okra'], ingredients: ['okra', 'palm oil', 'crayfish', 'stockfish', 'beef', 'pepper', 'ugu leaves', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], description: 'Fresh okra soup with meat, fish and ugu leaves.' },
  { match: ['afang'], ingredients: ['afang leaves', 'waterleaf', 'palm oil', 'periwinkle', 'crayfish', 'stockfish', 'beef', 'pepper'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Calabar-style afang soup with waterleaf, periwinkle and assorted meat.' },
  { match: ['edikang ikong', 'edikaikong'], ingredients: ['ugu leaves', 'waterleaf', 'palm oil', 'periwinkle', 'crayfish', 'stockfish', 'beef', 'pepper'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Vegetable-rich edikang ikong soup with periwinkle and meat.' },
  { match: ['efo riro', 'vegetable soup', 'efo'], ingredients: ['spinach', 'palm oil', 'tatashe pepper', 'locust beans', 'crayfish', 'assorted meat', 'stockfish', 'onion'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Yoruba-style efo riro – spinach cooked in a peppery palm oil base.' },
  { match: ['bitter leaf soup', 'ofe onugbu', 'onugbu'], ingredients: ['bitter leaf', 'cocoyam', 'palm oil', 'crayfish', 'stockfish', 'beef', 'ogiri', 'pepper'], mealTimes: ['lunch', 'dinner'], description: 'Igbo bitter leaf soup thickened with cocoyam.' },
  { match: ['oha soup', 'ofe oha'], ingredients: ['oha leaves', 'cocoyam', 'palm oil', 'crayfish', 'stockfish', 'beef', 'pepper'], mealTimes: ['lunch', 'dinner'], description: 'Traditional oha soup thickened with cocoyam.' },
  { match: ['banga', 'ofe akwu'], ingredients: ['palm fruit', 'banga spice', 'catfish', 'beef', 'crayfish', 'pepper', 'onion'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_fat'], description: 'Delta-style banga soup made from fresh palm fruit.' },
  { match: ['nsala', 'white soup'], ingredients: ['catfish', 'yam', 'utazi leaves', 'crayfish', 'pepper', 'ogiri', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['spicy'], description: 'Light, peppery white soup with catfish, thickened with yam.' },
  { match: ['pepper soup'], ingredients: ['goat meat', 'pepper soup spice', 'scotch bonnet pepper', 'scent leaf', 'onion', 'seasoning cube'], mealTimes: ['dinner'], healthTags: ['spicy', 'high_protein'], description: 'Hot, aromatic pepper soup with tender meat and scent leaves.' },
  { match: ['catfish pepper soup', 'point and kill'], ingredients: ['catfish', 'pepper soup spice', 'scotch bonnet pepper', 'scent leaf', 'onion'], mealTimes: ['dinner'], healthTags: ['spicy', 'high_protein'], description: 'Fresh catfish pepper soup with scent leaves.' },
  { match: ['eba', 'garri'], ingredients: ['garri (cassava)', 'water'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Smooth eba made from cassava garri – best with soup.' },
  { match: ['pounded yam', 'iyan'], ingredients: ['yam'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Soft, stretchy pounded yam.' },
  { match: ['amala'], ingredients: ['yam flour', 'water'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Classic amala made from yam flour.' },
  { match: ['fufu', 'akpu'], ingredients: ['fermented cassava'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Smooth cassava fufu.' },
  { match: ['semo', 'semovita', 'semolina'], ingredients: ['semolina (wheat)', 'water'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Soft semovita swallow.' },
  { match: ['wheat meal', 'wheat swallow'], ingredients: ['whole wheat flour', 'water'], mealTimes: ['lunch', 'dinner'], description: 'Whole wheat swallow.' },
  { match: ['beans and plantain', 'beans porridge', 'ewa agoyin', 'beans'], ingredients: ['beans', 'palm oil', 'onion', 'pepper', 'crayfish', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_protein'], description: 'Soft-cooked beans in a peppery palm oil sauce.' },
  { match: ['yam porridge', 'asaro'], ingredients: ['yam', 'palm oil', 'tomato', 'pepper', 'onion', 'crayfish', 'spinach', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Hearty yam porridge cooked in a pepper and palm oil sauce.' },
  { match: ['moi moi', 'moimoi', 'moin moin'], ingredients: ['beans', 'tatashe pepper', 'onion', 'vegetable oil', 'crayfish', 'boiled egg', 'seasoning cube'], mealTimes: ['breakfast', 'lunch'], healthTags: ['high_protein', 'steamed'], description: 'Steamed bean pudding with egg and peppers.' },
  { match: ['akara'], ingredients: ['beans', 'onion', 'scotch bonnet pepper', 'salt', 'vegetable oil'], mealTimes: ['breakfast', 'snack'], healthTags: ['fried', 'high_protein'], description: 'Crispy fried bean cakes – a Nigerian breakfast favourite.' },
  { match: ['pap', 'akamu', 'ogi', 'koko'], ingredients: ['fermented corn', 'water', 'sugar', 'milk'], mealTimes: ['breakfast'], description: 'Smooth, warm pap made from fermented corn.' },
  { match: ['bread and egg', 'egg sauce'], ingredients: ['bread', 'egg', 'tomato', 'onion', 'pepper', 'vegetable oil'], mealTimes: ['breakfast'], description: 'Soft bread with a peppery egg sauce.' },
  { match: ['indomie', 'noodles'], ingredients: ['instant noodles (wheat)', 'egg', 'onion', 'pepper', 'seasoning'], mealTimes: ['breakfast', 'lunch'], healthTags: ['high_carb'], description: 'Stir-fried noodles with egg and peppers.' },
  { match: ['spaghetti', 'jollof spaghetti', 'pasta'], ingredients: ['spaghetti (wheat)', ...STEW_BASE], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Spaghetti cooked jollof-style in tomato and pepper sauce.' },
  { match: ['plantain', 'dodo'], ingredients: ['ripe plantain', 'vegetable oil', 'salt'], mealTimes: ['lunch', 'snack'], healthTags: ['fried'], description: 'Sweet fried ripe plantain.' },
  { match: ['suya'], ingredients: ['beef', 'yaji spice (groundnut)', 'onion', 'tomato', 'cabbage'], mealTimes: ['dinner', 'snack'], healthTags: ['spicy', 'grilled', 'high_protein'], description: 'Grilled spicy beef skewers coated in yaji spice.' },
  { match: ['asun'], ingredients: ['goat meat', 'scotch bonnet pepper', 'onion', 'seasoning cube'], mealTimes: ['dinner', 'snack'], healthTags: ['spicy', 'grilled', 'high_protein'], description: 'Spicy smoked goat meat.' },
  { match: ['nkwobi', 'isi ewu'], ingredients: ['cow foot', 'palm oil', 'potash', 'utazi leaves', 'onion', 'pepper', 'ehuru'], mealTimes: ['dinner'], healthTags: ['spicy', 'high_fat'], description: 'Spicy cow foot in a thick palm oil sauce, garnished with utazi.' },
  { match: ['peppered chicken', 'fried chicken', 'chicken'], ingredients: ['chicken', 'pepper', 'onion', 'vegetable oil', 'seasoning cube'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_protein'], description: 'Seasoned chicken in a spicy pepper sauce.' },
  { match: ['grilled fish', 'roasted fish', 'barbecue fish'], ingredients: ['fish', 'pepper', 'onion', 'seasoning'], mealTimes: ['dinner'], healthTags: ['grilled', 'high_protein'], description: 'Whole fish grilled with peppers and spices.' },
  { match: ['puff puff'], ingredients: ['wheat flour', 'sugar', 'yeast', 'vegetable oil', 'nutmeg'], mealTimes: ['snack'], healthTags: ['fried', 'high_sugar'], description: 'Soft, sweet fried dough balls.' },
  { match: ['chin chin'], ingredients: ['wheat flour', 'sugar', 'butter', 'milk', 'egg', 'vegetable oil'], mealTimes: ['snack'], healthTags: ['fried', 'high_sugar'], description: 'Crunchy fried pastry bites.' },
  { match: ['meat pie'], ingredients: ['wheat flour', 'butter', 'minced beef', 'potato', 'carrot', 'onion', 'egg'], mealTimes: ['snack', 'breakfast'], description: 'Flaky pastry filled with minced meat and vegetables.' },
  { match: ['sausage roll'], ingredients: ['wheat flour', 'butter', 'sausage meat', 'egg'], mealTimes: ['snack', 'breakfast'], description: 'Flaky pastry wrapped around seasoned sausage.' },
  { match: ['shawarma'], ingredients: ['flatbread (wheat)', 'chicken', 'cabbage', 'carrot', 'cucumber', 'mayonnaise', 'ketchup', 'sausage'], mealTimes: ['lunch', 'dinner', 'snack'], description: 'Wrapped flatbread with grilled chicken, vegetables and creamy sauce.' },
  { match: ['small chops'], ingredients: ['puff puff', 'samosa', 'spring roll', 'chicken', 'gizzard', 'wheat flour', 'vegetable oil'], mealTimes: ['snack'], healthTags: ['fried'], description: 'Assorted party small chops.' },
  { match: ['moimoi and pap', 'akara and pap'], ingredients: ['beans', 'fermented corn', 'onion', 'pepper', 'vegetable oil'], mealTimes: ['breakfast'], description: 'Classic Nigerian breakfast combo.' },
  { match: ['zobo'], ingredients: ['hibiscus leaves', 'ginger', 'pineapple', 'sugar', 'cloves'], mealTimes: ['snack'], healthTags: ['high_sugar'], description: 'Chilled hibiscus drink spiced with ginger.' },
  { match: ['kunu'], ingredients: ['millet', 'ginger', 'sugar', 'tiger nut'], mealTimes: ['snack', 'breakfast'], description: 'Refreshing northern millet drink.' },
  { match: ['tuwo shinkafa', 'tuwo'], ingredients: ['rice'], mealTimes: ['lunch', 'dinner'], healthTags: ['high_carb'], description: 'Soft rice swallow from northern Nigeria.' },
  { match: ['miyan kuka', 'kuka'], ingredients: ['baobab leaf powder', 'dried fish', 'palm oil', 'locust beans', 'pepper'], mealTimes: ['lunch', 'dinner'], description: 'Northern baobab leaf soup.' },
];

// Longest matching phrase wins, so "catfish pepper soup" beats "pepper soup".
export function findDishTemplate(name: string): DishTemplate | null {
  const text = name.toLowerCase();
  let best: { template: DishTemplate; length: number } | null = null;
  for (const template of DISH_TEMPLATES) {
    for (const phrase of template.match) {
      if (containsTerm(text, phrase) && (!best || phrase.length > best.length)) {
        best = { template, length: phrase.length };
      }
    }
  }
  return best?.template ?? null;
}
