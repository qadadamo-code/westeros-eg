/**
 * Westeros menu — categories, items and prices as published on the restaurant's ordering page
 * (westeros.bonbell.online, read 2026-11-15). Prices are EGP, what the guest pays.
 * `was` = the struck-through price shown next to a discounted item.
 */
export interface WMenuCat {
  k: string;
  ar: string;
  en: string;
  icon: string;
  station: "grill" | "hot" | "cold" | "pastry" | "bar";
  color: string;
  items: WMenuItem[];
}
export interface WMenuItem {
  k: string;
  ar: string;
  en: string;
  desc?: string;
  price: number;
  was?: number;
  prep?: number;
  kcal?: number;
  spicy?: boolean;
}

export const WESTEROS_MENU: WMenuCat[] = [
  {
    k: "beef-burger", ar: "برجر اللحم المشوي", en: "Grilled beef burgers", icon: "flame", station: "grill", color: "#c2412d",
    items: [
      { k: "classic-beef", ar: "كلاسيك بيف برجر", en: "Classic beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع جبنة شيدر امريكي وخس", price: 195, prep: 15 },
      { k: "smoky-beef", ar: "سموكي بيف برجر", en: "Smoky beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع خلطة سموكي الحارة بالبصل", price: 205, prep: 15, spicy: true },
      { k: "brownie-beef", ar: "براوني بيف برجر", en: "Brownie beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع صوص الديمي جلاس بالمشروم", price: 195, prep: 15 },
      { k: "white-mushroom-beef", ar: "وايت مشروم بيف برجر", en: "White mushroom beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع صوص مشروم بكريمة وجبنة", price: 215, prep: 15 },
      { k: "stark-beef", ar: "ستارك بيف برجر", en: "Stark beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع جبنة شيدر امريكي وحلقات بصل", price: 205, prep: 15 },
      { k: "mondial-beef", ar: "مونديال بيف برجر", en: "Mondial beef burger", desc: "برجر لحم صافي جوا عيش بريوش محمص مع اصابع موزريلا وصوص جبنة", price: 225, prep: 15 },
    ],
  },
  {
    k: "chicken-burger", ar: "برجر الدجاج المشوي", en: "Grilled chicken burgers", icon: "flame", station: "grill", color: "#c46a12",
    items: [
      { k: "classic-chicken", ar: "كلاسيك تشكن برجر", en: "Classic chicken burger", desc: "صدر دجاج مفروم مشوي جوا عيش بريوش محمص مع جبنة شيدر امريكي", price: 175, prep: 15 },
      { k: "smoky-chicken", ar: "سموكي تشكن برجر", en: "Smoky chicken burger", desc: "صدر دجاج مفروم مشوي جوا عيش بريوش محمص مع خلطة سموكي الحارة", price: 185, prep: 15, spicy: true },
      { k: "white-mushroom-chicken", ar: "وايت مشروم تشكن برجر", en: "White mushroom chicken burger", desc: "صدر دجاج مفروم مشوي جوا عيش بريوش محمص مع صوص مشروم بالكريمة", price: 195, prep: 15 },
      { k: "stark-chicken", ar: "ستارك تشكن برجر", en: "Stark chicken burger", desc: "صدر دجاج مفروم مشوي جوا عيش بريوش محمص مع جبنة شيدر امريكي", price: 185, prep: 15 },
      { k: "mondial-chicken", ar: "مونديال تشكن برجر", en: "Mondial chicken burger", desc: "صدر دجاج مفروم مشوي جوا عيش بريوش محمص مع اصابع موزريلا وصوص جبنة", price: 205, prep: 15 },
      { k: "chicken-steak", ar: "تشكن ستيك برجر", en: "Chicken steak burger", desc: "صدر دجاج مشوي جوا عيش بريوش محمص مع خس وبصل مع مخلل خيار", price: 175, prep: 15 },
    ],
  },
  {
    k: "cordon-bleu", ar: "برجر كوردن بلو", en: "Cordon bleu burgers", icon: "flame", station: "hot", color: "#a8700c",
    items: [
      { k: "blueberg", ar: "بلوبيرج", en: "Blueberg", desc: "قطعة كوردن بلو برجر (190جم) محشوة بجبنة الموتزريلا والسلامي", price: 215, was: 260, prep: 20 },
      { k: "fire-blast", ar: "فير بلاست", en: "Fire blast", desc: "قطعة كوردن بلو برجر (190جم) محشوة بجبنة الموتزريلا والسلامي", price: 225, was: 270, prep: 20, spicy: true },
      { k: "mushroom-melt", ar: "مشروم ميلت", en: "Mushroom melt", desc: "قطعة كوردن بلو برجر (190جم) محشوة بجبنة الموتزريلا والسلامي", price: 235, was: 280, prep: 20 },
    ],
  },
  {
    k: "chicken-sandwich", ar: "ساندويشات الدجاج", en: "Chicken sandwiches", icon: "utensils", station: "hot", color: "#b4531f",
    items: [
      { k: "colonel", ar: "كولونيل", en: "Colonel", desc: "فيليه دجاج كرسبي مع خس وصوص رانش وصوص ستارك المدخن مع جبنة", price: 185, prep: 15 },
      { k: "commando", ar: "كوماندو", en: "Commando", desc: "فيليه دجاج كرسبي مع خس وصوص نوك آوت الحار وقطع هالبينو", price: 195, prep: 15, spicy: true },
      { k: "cajun", ar: "كاجون", en: "Cajun", desc: "شرائح صدر دجاج مع بصل ومشروم وصوص كريمة الكاجون الحارة", price: 225, prep: 15, spicy: true },
      { k: "picasso", ar: "بيكاسو", en: "Picasso", desc: "شرائح صدر دجاج مع المشروم مع صوص كريمة بالطماطم المجففة", price: 235, prep: 15 },
      { k: "pesto", ar: "بيستو", en: "Pesto", desc: "شرائح صدر دجاج مع المشروم والزيتون الاسود وصوص كريمة البيستو", price: 235, prep: 15 },
    ],
  },
  {
    k: "kids", ar: "وجبات الاطفال", en: "Kids meals", icon: "utensils", station: "grill", color: "#9a3b6b",
    items: [{ k: "kids-box", ar: "كيدز بوكس", en: "Kids box", desc: "برجر حجم وسط (لحم او دجاج) مع جبنة شيدر امريكي وصوص ويستروس", price: 170, was: 185, prep: 15 }],
  },
  {
    k: "offers", ar: "عروض %", en: "Offers", icon: "utensils", station: "grill", color: "#c2412d",
    items: [
      { k: "bundle-1", ar: "بندل 1", en: "Bundle 1", desc: "ستارك تشكن برجر + تشيز فرايز + V7 Cola", price: 245, was: 300, prep: 15 },
      { k: "bundle-2", ar: "بندل 2", en: "Bundle 2", desc: "دبل كلاسيك تشكن برجر (300جم) + سلطة كول سلو + كرانشي كيك", price: 315, was: 405, prep: 15 },
      { k: "bundle-3", ar: "بندل 3", en: "Bundle 3", desc: "ساندويش كولونيل + الفريدو فرايز + تروبيكال صودا", price: 325, was: 400, prep: 15 },
      { k: "bundle-4", ar: "بندل 4", en: "Bundle 4", desc: "تشكن برجر عدد 2 (كلاسيك، سموكي، ستارك) + شيربوكس + 2 V7 Cola", price: 560, was: 670, prep: 15 },
      { k: "duo-beef-box", ar: "ديو بيف بوكس", en: "Duo beef box", desc: "2 برجر بيف من اختيارك مع بطاطس و2 صوص و2 كولا", price: 495, was: 550, prep: 20 },
      { k: "duo-chicken-box", ar: "ديو تشكن بوكس", en: "Duo chicken box", desc: "2 برجر دجاج من اختيارك مع بطاطس و2 صوص و2 كولا", price: 475, was: 520, prep: 20 },
      { k: "share-box", ar: "شير بوكس", en: "Share box", desc: "عدد 4 تشكن ناجيتس + 4 حلقات بصل + 4 ميني شيدر هالبينو", price: 250, was: 315, prep: 20 },
      { k: "snack-box", ar: "سناك بوكس", en: "Snack box", desc: "برجر لحم او دجاج متوسط الحجم مع جبنة شيدر امريكي وصوص ويستروس", price: 135, was: 160, prep: 15 },
    ],
  },
  {
    k: "healthy", ar: "وجبات صحية", en: "Healthy meals", icon: "salad", station: "cold", color: "#1d7f4a",
    items: [
      { k: "dumbbells-diet", ar: "دمبلز دايت ميل", en: "Dumbbells diet meal", desc: "صدر دجاج مشوي (200جم)، ذرة حلوة، خس، طماطم، مخلل وهالبينو", price: 215, prep: 20, kcal: 350 },
      { k: "cardio-diet", ar: "كارديو دايت ميل", en: "Cardio diet meal", desc: "صدر دجاج مشوي (200جم)، رز بسمتي بالخضار", price: 225, prep: 20, kcal: 570 },
      { k: "mix-diet", ar: "مكس دايت ميل", en: "Mix diet meal", desc: "صدر دجاج مشوي (200جم)، رز بسمتي بالخضار، ذرة حلوة، طماطم", price: 255, prep: 15, kcal: 635 },
      { k: "v7-diet", ar: "في7 كولا دايت", en: "V7 Cola diet", price: 30, prep: 1 },
    ],
  },
  {
    k: "fries", ar: "البطاطس", en: "Fries", icon: "utensils", station: "hot", color: "#a8700c",
    items: [
      { k: "fries-s", ar: "فرايز (S)", en: "Fries (S)", price: 40, prep: 10 },
      { k: "fries-l", ar: "فرايز (L)", en: "Fries (L)", price: 60, prep: 5 },
      { k: "cheese-fries", ar: "تشيز فرايز", en: "Cheese fries", desc: "بطاطس عليها صوص جبنة شيدر مع هالبينو", price: 85, prep: 5 },
      { k: "dynamite-fries", ar: "ديناميت فرايز", en: "Dynamite fries", desc: "بطاطس عليها صوص جبنة شيدر وكرسبي بايتس مع صوص رانش وديناميت", price: 135, prep: 15, spicy: true },
      { k: "bbq-fries", ar: "باربكيو فرايز", en: "BBQ fries", desc: "بطاطس عليها صوص جبنة شيدر ولحم مفروم مع صوص باربكيو وهالبينو", price: 140, prep: 15 },
      { k: "alfredo-fries", ar: "ألفريدو فرايز", en: "Alfredo fries", desc: "بطاطس عليها صوص كريمة ألفريدو بالمشروم مع جبنة موزريلا", price: 145, prep: 15 },
      { k: "cowboy-fries", ar: "كاوبوي فرايز", en: "Cowboy fries", desc: "بطاطس عليها صوص كريمة بالطماطم المجففة وقطع هالبينو", price: 145, prep: 15 },
    ],
  },
  {
    k: "starters", ar: "المقبلات", en: "Starters", icon: "utensils", station: "hot", color: "#7a5a12",
    items: [
      { k: "nuggets", ar: "تشكن ناجيتس", en: "Chicken nuggets", desc: "صدر دجاج مفروم مغلف بطبقة بقسماط بانكو المقرمش. (6 قطع)", price: 140, was: 170, prep: 15 },
      { k: "dynamite-bites", ar: "ديناميت بايتس", en: "Dynamite bites", desc: "قطع دجاج كرسبي بصوص ديناميت مع خس", price: 135, prep: 15, spicy: true },
      { k: "stark-bites", ar: "ستارك بايتس", en: "Stark bites", desc: "قطع دجاج مقرمش بصوص ستارك مع خس", price: 135, prep: 15 },
      { k: "cheddar-jalapeno", ar: "اصابع شيدر هالبينو", en: "Cheddar jalapeño sticks", price: 90, prep: 10, spicy: true },
      { k: "mozzarella-sticks", ar: "اصابع موزريلا", en: "Mozzarella sticks", price: 80, prep: 10 },
      { k: "onion-rings", ar: "حلقات بصل", en: "Onion rings", price: 60, prep: 10 },
    ],
  },
  {
    k: "salads", ar: "السلطات", en: "Salads", icon: "salad", station: "cold", color: "#4b6b3a",
    items: [
      { k: "fitness-salad", ar: "سلطة فتنيس", en: "Fitness salad", desc: "خس، جرجير، بصل مخلل، فاصوليا حمراء مع صوص بالليمون", price: 95, prep: 15, kcal: 170 },
      { k: "caesar-chicken", ar: "سلطة سيزر بالدجاج", en: "Chicken caesar salad", desc: "خس مع صوص السيزر وصدر دجاج مشوي مع جبنة وخبز توست", price: 125, prep: 15 },
      { k: "chicken-ranch", ar: "سلطة تشكن رانش", en: "Chicken ranch salad", desc: "خس وطماطم وبصل مخلل وزيتون اسود مع صوص رانش وصدر دجاج مشوي وناتشوز", price: 135, prep: 15 },
      { k: "coleslaw", ar: "سلطة كولسلو", en: "Coleslaw", price: 35 },
      { k: "corn-salad", ar: "سلطة ذرة", en: "Corn salad", price: 45 },
    ],
  },
  {
    k: "sauces", ar: "الصوصات", en: "Sauces", icon: "utensils", station: "cold", color: "#5b6a64",
    items: [
      { k: "sauce-ranch", ar: "صوص رانش", en: "Ranch sauce", price: 20 },
      { k: "sauce-knockout", ar: "صوص نوك آوت", en: "Knock-out sauce", price: 20, spicy: true },
      { k: "sauce-bbq", ar: "صوص باربكيو", en: "BBQ sauce", price: 20 },
      { k: "sauce-westeros", ar: "صوص ويستروس", en: "Westeros sauce", price: 20 },
      { k: "sauce-dynamite", ar: "صوص ديناميت", en: "Dynamite sauce", price: 25, spicy: true },
      { k: "sauce-stark", ar: "صوص ستارك", en: "Stark sauce", price: 25 },
      { k: "sauce-cheddar", ar: "صوص جبنة شيدر", en: "Cheddar cheese sauce", price: 25 },
    ],
  },
  {
    k: "desserts", ar: "حلويات ومشروبات ساخنة", en: "Desserts & hot drinks", icon: "cake-slice", station: "pastry", color: "#9a3b6b",
    items: [
      { k: "turkish-coffee", ar: "قهوة تركي سنجل", en: "Turkish coffee, single", price: 35, prep: 5 },
      { k: "crunchy-chocolate", ar: "كرانشي كيك (تشوكليت)", en: "Crunchy cake (chocolate)", desc: "فادج كيك مع الشوكولاته البلجيكية مع بسكويت الفيوتين المقرمش", price: 125, prep: 10 },
      { k: "crunchy-lotus", ar: "كرانشي كيك (لوتس)", en: "Crunchy cake (lotus)", desc: "فادج كيك مع صوص لوتس بلجيكي مع بسكويت لوتس تقدم ساخنة", price: 125, prep: 10 },
      { k: "crunchy-almond", ar: "كرانشي كيك (الموند)", en: "Crunchy cake (almond)", desc: "فادج كيك مع شوكولاته بلجيكي شقراء مع رقائق اللوز المحمص", price: 125, prep: 10 },
    ],
  },
  {
    k: "milkshake", ar: "ميلك شيك", en: "Milkshakes", icon: "cup-soda", station: "bar", color: "#6b4fa0",
    items: [
      { k: "shake-caramel-popcorn", ar: "كراميل بوب كورن ميلك شيك", en: "Caramel popcorn milkshake", desc: "ميلك شيك بالكراميل بوب كورن مع صوص دولسي ديليتشي", price: 145 },
      { k: "shake-cheesecake", ar: "تشيز كيك ميلك شيك", en: "Cheesecake milkshake", desc: "ميلك شيك بطعم تشيز كيك بالبسكويت وبيوريه مكس توت والفراولة", price: 135 },
      { k: "shake-sour-candy", ar: "ساور كاندي ميلك شيك", en: "Sour candy milkshake", desc: "ميلك شيك بحبيبات ساور سكيتلز مع بيوريه فراولة", price: 160 },
      { k: "shake-peanutella", ar: "بيناتيلا ميلك شيك", en: "Peanutella milkshake", desc: "ميلك شيك بالشوكولاته وزبدة فول السوداني المملح", price: 145 },
      { k: "shake-pistachio", ar: "بستاشيو ميلك شيك", en: "Pistachio milkshake", desc: "ميلك شيك بزبدة الفستق الحلبي البستاشيو", price: 160 },
      { k: "shake-choco-hazelnut", ar: "شوكو هازلنت ميلك شيك", en: "Choco hazelnut milkshake", desc: "ميلك شيك شوكولاته بالبندق وزبدة البندق", price: 135 },
    ],
  },
  {
    k: "mocktail", ar: "موكتيل", en: "Mocktails", icon: "cup-soda", station: "bar", color: "#2f6f9f",
    items: [
      { k: "fizzy-mango", ar: "فيزي مانجو موكتيل", en: "Fizzy mango mocktail", desc: "بيوريه المانجو وعصير البرتقال مع مياه فوارة", price: 85 },
      { k: "summer-chill", ar: "سمر تشيل موكتيل", en: "Summer chill mocktail", desc: "بيوريه الخوخ وعصير التفاح الاحمر مع مياه فوارة", price: 90 },
      { k: "pink-honey", ar: "بينك هوني ليمونيد موكتيل", en: "Pink honey lemonade mocktail", desc: "عسل طبيعي وعصير الليمون وجراندين ومياه فوارة", price: 95 },
    ],
  },
  {
    k: "italian-soda", ar: "ايطاليان صودا", en: "Italian soda", icon: "cup-soda", station: "bar", color: "#3a5f7a",
    items: [
      { k: "mojito-soda", ar: "موهيتو صودا", en: "Mojito soda", desc: "سيرب ليمون ونعناع مع مياه فوارة", price: 60 },
      { k: "tropical-soda", ar: "تروبيكال صودا", en: "Tropical soda", desc: "بيوريه باشون فروت وسيرب رمان مع مياه فوارة", price: 65 },
      { k: "energy-soda", ar: "انيرجي صودا", en: "Energy soda", desc: "سيرب بلاك بيري ونعناع مع مشروب طاقة", price: 60 },
    ],
  },
  {
    k: "soft-drinks", ar: "مشروبات غازية وعصير", en: "Soft drinks & juice", icon: "cup-soda", station: "bar", color: "#2f6f9f",
    items: [
      { k: "uber-energy", ar: "اوبر مشروب طاقة", en: "Uber energy drink", desc: "مشروب طاقة تركي", price: 50 },
      { k: "fresh-orange", ar: "عصير برتقال فرش", en: "Fresh orange juice", desc: "300 ml", price: 55, kcal: 135 },
      { k: "v-cola", ar: "V Cola", en: "V Cola", price: 30 },
      { k: "twist-energy", ar: "توست مشروب طاقة", en: "Twist energy drink", price: 20 },
      { k: "big-cola", ar: "بيج كولا", en: "Big Cola", price: 15 },
      { k: "pure-juice", ar: "عصير بيور", en: "Pure juice", price: 25 },
      { k: "water-small", ar: "مياه معدنية صغير", en: "Mineral water, small", price: 10 },
    ],
  },
];
