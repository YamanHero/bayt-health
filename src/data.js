export const SLOTS = [
  { id: 'breakfast', label: 'فطور', icon: '🌅' },
  { id: 'lunch', label: 'غدا', icon: '🍲' },
  { id: 'dinner', label: 'عشا', icon: '🌙' },
  { id: 'snack', label: 'سناك', icon: '🍎' },
];
export const slotLabel = (id) => SLOTS.find((s) => s.id === id)?.label ?? id;

export const KINDS = [
  { id: 'walk', label: 'مشي', icon: '🚶' },
  { id: 'run', label: 'ركض', icon: '🏃' },
  { id: 'gym', label: 'نادي / تمارين', icon: '🏋️' },
  { id: 'swim', label: 'سباحة', icon: '🏊' },
  { id: 'bike', label: 'دراجة', icon: '🚴' },
  { id: 'football', label: 'كرة قدم', icon: '⚽' },
  { id: 'other', label: 'غير ذلك', icon: '✨' },
];
export const kindOf = (id) => KINDS.find((k) => k.id === id) ?? KINDS[KINDS.length - 1];

export const ACTIVITY = [
  { id: 'low', label: 'قليل الحركة' },
  { id: 'light', label: 'حركة خفيفة' },
  { id: 'moderate', label: 'متوسط' },
  { id: 'high', label: 'نشيط جداً' },
];

export const COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f'];

// Suggested home menus — halal, no chicken, no bread. Rough kcal estimates for adults.
export const MENUS = [
  {
    name: 'يوم فلسطيني خفيف',
    meals: [
      { slot: 'breakfast', title: 'لبنة وخضار', items: '3 ملاعق لبنة + زيت زيتون + زعتر، خيار وبندورة، 5 حبات زيتون، بيضة مسلوقة', kcal: 380 },
      { slot: 'lunch', title: 'مجدّرة مع سلطة', items: 'صحن متوسط مجدّرة برغل وعدس + سلطة عربية كبيرة + لبن', kcal: 560 },
      { slot: 'snack', title: 'فاكهة ومكسرات', items: 'تفاحة + حفنة لوز (10 حبات)', kcal: 170 },
      { slot: 'dinner', title: 'شكشوكة', items: 'بيضتين بالبندورة والفلفل + سلطة خضرا', kcal: 330 },
    ],
  },
  {
    name: 'يوم شامي',
    meals: [
      { slot: 'breakfast', title: 'فول مدمّس', items: 'صحن فول بزيت الزيتون والليمون + بندورة ونعنع + شاي بدون سكر', kcal: 400 },
      { slot: 'lunch', title: 'كفتة لحمة بالفرن', items: '3 أصابع كفتة مع خضار مشوية + فتوش بدون خبز', kcal: 590 },
      { slot: 'snack', title: 'لبن وخيار', items: 'كاسة لبن مع خيار ونعنع', kcal: 120 },
      { slot: 'dinner', title: 'شوربة عدس', items: 'صحن شوربة عدس + ليمون + سلطة صغيرة', kcal: 320 },
    ],
  },
  {
    name: 'يوم لبناني بحري',
    meals: [
      { slot: 'breakfast', title: 'عجة بالزعتر', items: 'عجة بيضتين بالبقدونس + زعتر وزيت + بندورة', kcal: 350 },
      { slot: 'lunch', title: 'سمك مشوي مع أرز', items: 'فيلي سمك مشوي + نص كاسة أرز + طحينة وسلطة', kcal: 580 },
      { slot: 'snack', title: 'تمر ولبن', items: '3 حبات تمر + كاسة لبن', kcal: 200 },
      { slot: 'dinner', title: 'تبولة وحمّص', items: 'صحن تبولة + 3 ملاعق حمّص', kcal: 340 },
    ],
  },
  {
    name: 'يوم طبيخ بيتي',
    meals: [
      { slot: 'breakfast', title: 'حلّوم وخضار', items: 'شريحتين حلّوم مشوي + خيار وبندورة + زيتون', kcal: 360 },
      { slot: 'lunch', title: 'بامية أو فاصوليا باللحمة', items: 'صحن طبيخ + 4 ملاعق أرز + سلطة', kcal: 600 },
      { slot: 'snack', title: 'برتقالة', items: 'برتقالة أو حبتين يوسفي', kcal: 80 },
      { slot: 'dinner', title: 'فريكة مع لبن', items: 'صحن صغير فريكة + لبن + سلطة', kcal: 380 },
    ],
  },
];
