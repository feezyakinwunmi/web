import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ImagePlus, Sparkles, X, AlertTriangle } from 'lucide-react';
import { Button, Chip, Drawer, Field, Input, Select, Textarea, Toggle } from '../../components/ui';
import { useFeedback } from '../../components/Toast';
import { invokeFunction, supabase } from '../../lib/supabase';
import { detectAllergens, allergenById } from '../../lib/foodSafety';
import { findDishTemplate, type MealTime } from '../../lib/dishTemplates';
import type { HealthTag, Product } from '../../lib/types';

export const CATEGORIES = [
  'Rice Dishes', 'Pasta', 'Swallow', 'Soups & Stews', 'Grilled & Fried', 'Small Chops',
  'Beverages', 'Desserts', 'Specials', 'Drinks', 'Snacks', 'Bake',
];

const MEAL_TIMES: { id: MealTime; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function MenuEditor({
  open,
  product,
  vendorId,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: Product | null;
  vendorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [category, setCategory] = useState('');
  const [prepTime, setPrepTime] = useState('20-30 min');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [trackStock, setTrackStock] = useState(false);
  const [stock, setStock] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  const [mealTimes, setMealTimes] = useState<MealTime[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [healthTags, setHealthTags] = useState<HealthTag[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(product?.name || '');
    setDescription(product?.description || '');
    setPrice(product?.price?.toString() || '');
    setOriginalPrice(product?.original_price?.toString() || '');
    setCategory(product?.category || '');
    setPrepTime(product?.preparation_time || '20-30 min');
    setIsAvailable(product?.is_available ?? true);
    setIsPopular(!!product?.is_popular);
    setTrackStock(!!product?.track_stock);
    setStock(product?.stock_quantity?.toString() || '');
    setIngredients(product?.ingredients || []);
    setIngredientInput('');
    setMealTimes((product?.meal_times || []) as MealTime[]);
    setTags(product?.health_tags || []);
    setImageUrl(product?.image_url || null);
    setImageFile(null);
  }, [open, product]);

  useEffect(() => {
    supabase
      .from('health_tags_reference')
      .select('id, tag, label, category')
      .order('category')
      .then(({ data }) => setHealthTags((data as HealthTag[]) || []));
  }, []);

  // Typed-but-not-added ingredients still count.
  const pendingIngredients = ingredientInput.split(',').map(s => s.trim()).filter(Boolean);
  const allIngredients = [...ingredients, ...pendingIngredients];
  const detected = useMemo(
    () => detectAllergens({ name, description, ingredients: allIngredients }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, description, ingredients.join('|'), ingredientInput]
  );

  const addIngredients = () => {
    if (!pendingIngredients.length) return;
    setIngredients(prev => {
      const seen = new Set(prev.map(i => i.toLowerCase()));
      return [...prev, ...pendingIngredients.filter(i => !seen.has(i.toLowerCase()))];
    });
    setIngredientInput('');
  };

  const applySuggestion = (s: { ingredients: string[]; description?: string; healthTags?: string[]; mealTimes?: MealTime[] }) => {
    setIngredients(prev => {
      const seen = new Set(prev.map(i => i.toLowerCase()));
      return [...prev, ...s.ingredients.filter(i => !seen.has(i.toLowerCase()))];
    });
    if (s.description && !description.trim()) setDescription(s.description);
    const known = new Set(healthTags.map(t => t.tag));
    const suggested = (s.healthTags || []).filter(t => known.has(t));
    if (suggested.length) setTags(prev => Array.from(new Set([...prev, ...suggested])));
    if (s.mealTimes?.length && mealTimes.length === 0) setMealTimes(s.mealTimes);
  };

  const autoFill = async () => {
    if (name.trim().length < 2) {
      toast('Enter the dish name first', 'error');
      return;
    }
    const template = findDishTemplate(name);
    if (template) {
      applySuggestion({ ingredients: template.ingredients, description: template.description, healthTags: template.healthTags, mealTimes: template.mealTimes });
      toast('Typical recipe added — check it matches how you cook it', 'info');
      return;
    }
    setAutoFilling(true);
    try {
      const res = await invokeFunction<{ data: { ingredients: string[]; description: string; health_tags: string[]; meal_times: MealTime[] } }>(
        'suggest-dish-info',
        { name, description, category, allowed_health_tags: healthTags.map(t => t.tag) }
      );
      applySuggestion({
        ingredients: res.data.ingredients || [],
        description: res.data.description,
        healthTags: res.data.health_tags,
        mealTimes: res.data.meal_times,
      });
      toast('AI suggested the typical recipe — please review it', 'info');
    } catch (e) {
      toast((e as Error).message || 'Auto-fill unavailable — add ingredients manually', 'error');
    } finally {
      setAutoFilling(false);
    }
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error');
    if (file.size > MAX_IMAGE_BYTES) return toast('Image must be under 5 MB', 'error');
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return product?.image_url || null;
    const ext = (imageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${vendorId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, imageFile, {
      contentType: imageFile.type,
      upsert: false,
    });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const priceNum = Number(price);
    if (!name.trim()) return toast('Enter the dish name', 'error');
    if (!priceNum || priceNum <= 0) return toast('Enter a valid price', 'error');
    if (!category) return toast('Choose a category', 'error');
    if (allIngredients.length === 0) return toast('List the ingredients — admins review them before the dish goes live', 'error');

    setSaving(true);
    try {
      const image_url = await uploadImage();
      const record = {
        name: name.trim(),
        description: description.trim(),
        price: Math.round(priceNum),
        original_price: originalPrice ? Math.round(Number(originalPrice)) : null,
        category,
        preparation_time: prepTime,
        is_available: isAvailable,
        is_popular: isPopular,
        track_stock: trackStock,
        stock_quantity: trackStock ? Math.max(0, Math.round(Number(stock) || 0)) : null,
        image_url,
        ingredients: allIngredients,
        meal_times: mealTimes,
        health_tags: tags,
        allergens: Array.from(new Set([...tags.filter(t => allergenById(t)), ...detected.map(d => d.allergen.id)])),
      };

      if (product) {
        const { error } = await supabase.from('products').update(record).eq('id', product.id);
        if (error) throw error;
        toast('Dish updated. Changes to details go back to admin review.');
      } else {
        const { error } = await supabase
          .from('products')
          .insert({ ...record, vendor_id: vendorId, approval_status: 'pending', created_at: new Date().toISOString() });
        if (error) throw error;
        toast('Dish added — it will go live once an admin approves it');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message || 'Could not save dish', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tagGroups = healthTags.reduce<Record<string, HealthTag[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});
  const groupLabels: Record<string, string> = {
    allergy: 'Allergens', dietary: 'Dietary', nutrition: 'Nutrition', preparation: 'Preparation',
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product ? 'Edit dish' : 'Add dish'}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="menu-editor" loading={saving}>{product ? 'Save changes' : 'Add dish'}</Button>
        </>
      }
    >
      <form id="menu-editor" onSubmit={save} className="space-y-5">
        <div className="flex gap-4">
          <label className="flex size-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2 text-ink-3 hover:border-brand">
            {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : <ImagePlus className="size-7" />}
            <input type="file" accept="image/*" className="hidden" onChange={e => pickImage(e.target.files?.[0])} />
          </label>
          <div className="flex-1 space-y-3">
            <Field label="Dish name">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jollof Rice with Chicken" required />
            </Field>
            <button
              type="button"
              onClick={autoFill}
              disabled={autoFilling}
              className="flex w-full items-center gap-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-left text-sm hover:bg-brand/15 disabled:opacity-60"
            >
              <Sparkles className="size-4 shrink-0 text-brand" />
              <span>
                <span className="font-medium text-ink">{autoFilling ? 'Filling in…' : 'Auto-fill from dish name'}</span>
                <span className="block text-xs text-ink-2">Typical ingredients, description and tags — you just check and edit.</span>
              </span>
            </button>
          </div>
        </div>

        <Field label="Description">
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What customers will read" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (₦)">
            <Input type="number" min={1} value={price} onChange={e => setPrice(e.target.value)} required />
          </Field>
          <Field label="Original price (₦)" hint="Optional, shows as a discount">
            <Input type="number" min={0} value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} />
          </Field>
          <Field label="Prep time">
            <Input value={prepTime} onChange={e => setPrepTime(e.target.value)} />
          </Field>
        </div>

        <Field label="Category">
          <Select value={category} onChange={e => setCategory(e.target.value)} required>
            <option value="">Choose a category</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Best for</span>
          <div className="flex flex-wrap gap-2">
            {MEAL_TIMES.map(m => (
              <Chip
                key={m.id}
                active={mealTimes.includes(m.id)}
                onClick={() => setMealTimes(prev => (prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]))}
              >
                {m.label}
              </Chip>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-3">Shows this dish to customers at the right time of day.</span>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Ingredients</span>
          <div className="flex gap-2">
            <Input
              value={ingredientInput}
              onChange={e => setIngredientInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addIngredients();
                }
              }}
              placeholder="Rice, tomato, crayfish… (comma separated, Enter to add)"
            />
            <Button type="button" variant="secondary" onClick={addIngredients}>Add</Button>
          </div>
          {ingredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ingredients.map((ing, i) => (
                <span key={ing + i} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-xs">
                  {ing}
                  <button type="button" onClick={() => setIngredients(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${ing}`}>
                    <X className="size-3 text-ink-3 hover:text-ink" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {detected.length > 0 && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warn">
                <AlertTriangle className="size-3.5" /> Allergens detected (saved automatically)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detected.map(d => (
                  <span key={d.allergen.id} className="rounded-full bg-warn/15 px-2.5 py-1 text-xs">
                    {d.allergen.icon} {d.allergen.label} <span className="text-ink-3">({d.matches.join(', ')})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {Object.keys(tagGroups).length > 0 && (
          <div className="space-y-3">
            <span className="block text-sm font-medium text-ink-2">Health tags</span>
            {Object.entries(tagGroups).map(([group, list]) => (
              <div key={group}>
                <div className="mb-1.5 text-xs text-ink-3">{groupLabels[group] || group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(t => (
                    <Chip
                      key={t.id}
                      active={tags.includes(t.tag)}
                      onClick={() => setTags(prev => (prev.includes(t.tag) ? prev.filter(x => x !== t.tag) : [...prev, t.tag]))}
                    >
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-2">
          <Toggle checked={isAvailable} onChange={setIsAvailable} label="Available to order" />
          <Toggle checked={isPopular} onChange={setIsPopular} label="Mark as popular" />
          <Toggle checked={trackStock} onChange={setTrackStock} label="Track stock" />
          {trackStock && (
            <Input type="number" min={0} value={stock} onChange={e => setStock(e.target.value)} placeholder="Quantity in stock" />
          )}
        </div>
      </form>
    </Drawer>
  );
}
