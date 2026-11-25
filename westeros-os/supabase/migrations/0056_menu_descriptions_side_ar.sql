-- (Saqr 2026-11-25، بطلبه) شرح المكونات الكامل من Bonbell لكل الأصناف بكل الفروع، وترجمة الخيارات الجانبية للعربي.
-- Bonbell عنده الشرح بالإنجليزي بس: الإنجليزي بينحط زي ما هو، والعربي ترجمته الكاملة (بدل الشرح المختصر القديم).
-- المطابقة: رقم الصنف في Bonbell أول شي، وبعدين الاسم العربي أو الإنجليزي. الأصناف اللي مش في Bonbell ما بتتلمسش.
-- الخيارات الجانبية: الاسم العربي بينحط بس للي ما إلهاش اسم عربي أو اسمها العربي زي الإنجليزي (اللي اتعدل باليد بيفضل).
-- كل تعديل بيتسجل في السجل والاسترجاع.

drop table if exists pg_temp.bb_desc, pg_temp.bb_side;
create temporary table bb_desc (ref text, name_ar text, name_en text, desc_ar text, desc_en text);
insert into bb_desc values
  ('82653', 'كلاسيك بيف برجر', 'Classic Beef Burger', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، مع جبنة شيدر أمريكي، خس، بصل، طماطم، مخلل وصوص وستروس.', 'Pure beef patty inside a toasted brioche bun, with an American cheddar cheese, lettuce, onion, tomato, pickles & Westeros sauce.'),
  ('90099', 'سموكي بيف برجر 🌶️', 'Smoky Beef Burger 🌶️', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، وفوقها خلطة سموكي الحارة من البصل المكرمل وصوص الباربكيو الكريمي، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Pure beef patty inside a toasted brioche bun, on top spicy Smokey mix of caramelized onion & creamy BBQ sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('90103', 'براوني بيف برجر', 'Brownie Beef Burger', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، وفوقها خلطة براوني من المشروم والبصل المكرمل وصوص الديمي جلاس، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Pure beef patty inside a toasted brioche bun, on top Brownie mix of mushroom, caramelized onion & demi-glace sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('90100', 'وايت مشروم بيف برجر', 'White Mushroom Beef Burger', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، وفوقها خلطة وايت مشروم من المشروم والصوص الكريمي، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Pure beef patty inside a toasted brioche bun, on top White Mushroom mix of mushroom & creamy sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('90101', 'ستارك بيف برجر', 'Stark Beef Burger', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، مع جبنة شيدر أمريكي، حلقات بصل، سلامي، خس، طماطم وصوص ستارك.', 'Pure beef patty inside a toasted brioche bun, with an American cheddar cheese, onion rings, salami, lettuce, tomato & Stark sauce.'),
  ('90102', 'مونديال بيف برجر', 'Mondial Beef Burger', 'قطعة لحم بقري صافي جوا عيش بريوش محمص، مع أصابع موتزاريلا، صوص جبنة شيدر، صوص باربكيو وصوص وستروس، مع هالبينو وخس.', 'Pure beef patty inside a toasted brioche bun, with mozzarella sticks, cheddar cheese sauce, BBQ sauce & Westeros sauce, with jalapeno & lettuce.'),
  ('90105', 'كلاسيك تشكن برجر', 'Classic Chicken Burger', 'صدر دجاج مفروم مشوي جوا عيش بريوش محمص، مع جبنة شيدر أمريكي، خس، بصل، طماطم، مخلل وصوص وستروس.', 'Grilled minced chicken breast inside a toasted brioche bun, with an American cheddar cheese, lettuce, onion, tomato, pickles & Westeros sauce.'),
  ('90108', 'سموكي تشكن برجر 🌶️', 'Smoky Chicken Burger 🌶️', 'صدر دجاج مفروم مشوي جوا عيش بريوش محمص، وفوقها خلطة سموكي الحارة من البصل المكرمل وصوص الباربكيو الكريمي، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Grilled minced chicken breast inside a toasted brioche bun, on top spicy Smokey mix of caramelized onion & creamy BBQ sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('90109', 'وايت مشروم تشكن برجر', 'White Mushroom Chicken Burger', 'صدر دجاج مفروم مشوي جوا عيش بريوش محمص، وفوقها خلطة وايت مشروم من المشروم والصوص الكريمي، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Grilled minced chicken breast inside a toasted brioche bun, on top White Mushroom mix of mushroom & creamy sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('90114', 'ستارك تشكن برجر', 'Stark Chicken Burger', 'صدر دجاج مفروم مشوي جوا عيش بريوش محمص، مع جبنة شيدر أمريكي، حلقات بصل، سلامي، خس، طماطم وصوص ستارك.', 'Grilled minced chicken breast inside a toasted brioche bun, with an American cheddar cheese, onion rings, salami, lettuce, tomato & Stark sauce.'),
  ('90115', 'مونديال تشكن برجر', 'Mondial Chicken Burger', 'صدر دجاج مفروم مشوي جوا عيش بريوش محمص، مع أصابع موتزاريلا، صوص جبنة شيدر، صوص باربكيو وصوص وستروس، مع هالبينو وخس.', 'Grilled minced chicken breast inside a toasted brioche bun, with mozzarella sticks, cheddar cheese sauce, BBQ sauce & Westeros sauce, with jalapeno & lettuce.'),
  ('153486', 'تشكن ستيك برجر', 'Chicken Steak Burger', 'صدر دجاج مشوي جوا عيش بريوش محمص، مع خس، بصل، مخلل وصوص وستروس.', 'Grilled chicken breast inside a toasted brioche bun, with lettuce, onion, pickles & Westeros sauce.'),
  ('160561', 'بلوبيرج', 'BleuBurg', 'قطعة تشيكن كوردون بلو (190 جم) محشية جبنة موتزاريلا وسلامي، مع خس، مخلل وصوص وستروس.', 'Chicken Cordon Bleu piece (190g) filled with mozzarella cheese & salami, lettuce, pickles & Westeros sauce'),
  ('160562', 'فير بلاست 🌶️', 'Fire Blast 🌶️', 'قطعة تشيكن كوردون بلو (190 جم) محشية جبنة موتزاريلا وسلامي، مع خس، بصل مخلل وصوص نوك آوت الحار.', 'Chicken Cordon Bleu piece (190g) filled with mozzarella cheese & salami, lettuce, pickled onion & Spicy Knockout sauce.'),
  ('160563', 'مشروم ميلت', 'Mushroom Melt', 'قطعة تشيكن كوردون بلو (190 جم) محشية جبنة موتزاريلا وسلامي، مع صوص المشروم الكريمي، خس ومايونيز.', 'Chicken Cordon Bleu piece (190g) filled with mozzarella cheese & salami, creamy mushroom sauce, lettuce & Mayonnaise.'),
  ('90117', 'نوك آوت كرسبي 🌶️', 'Knock Out Crispy 🌶️', 'فيليه دجاج كرسبي جوا عيش بريوش محمص، مع خس، طماطم وصوص نوك آوت الحار.', 'Crispy chicken fillet inside a toasted brioche bun, with lettuce, tomato & spicy Knock Out sauce.'),
  ('135366', 'كلاسيك كرسبي', 'Classic Crispy', 'فيليه دجاج كرسبي جوا عيش بريوش محمص، مع خس، طماطم وصوص وستروس.', 'Crispy chicken fillet inside a toasted brioche bun, with lettuce, tomato & Westeros sauce.'),
  ('90120', 'ديناميت كرسبي 🌶️', 'Dynamite Crispy 🌶️', 'فيليه دجاج كرسبي جوا عيش بريوش محمص، مع هالبينو، خس، صوص ديناميت وصوص رانش.', 'Crispy chicken fillet inside a toasted brioche bun, with jalapeno, lettuce, Dynamite & Ranch sauces.'),
  ('90118', 'روكيت كرسبي', 'Rocket Crispy Burger', 'فيليه دجاج كرسبي جوا عيش بريوش محمص، مع جرجير، سلامي، هالبينو ومايونيز.', 'Crispy chicken fillet inside a toasted brioche bun, with Rocca, salami, jalapeno & mayonnaise.'),
  ('90119', 'وايت مشروم كرسبي', 'White Mushroom Crispy', 'فيليه دجاج كرسبي جوا عيش بريوش محمص، وفوقه خلطة وايت مشروم من المشروم والصوص الكريمي، مع جبنة شيدر أمريكي، خس ومايونيز.', 'Crispy chicken fillet inside a toasted brioche bun, on top White Mushroom mix of mushroom and creamy sauce, with an American cheddar cheese, lettuce & mayonnaise.'),
  ('134727', 'كولونيل', 'Colonel', 'قطع دجاج كرسبي جوا عيش فينو، مع خس، صوص رانش وصوص ستارك، وفوقها جبنة موتزاريلا سايحة.', 'Crispy chicken bites inside Vienna bun, with lettuce, Ranch sauce & Stark sauce, and melted mozzarella cheese on top.'),
  ('134730', 'كوماندو🌶️', 'Commando🌶️', 'قطع دجاج كرسبي جوا عيش فينو، مع خس، هالبينو وصوص نوك آوت الحار، وفوقها جبنة شيدر سايحة.', 'Crispy chicken bites inside Vienna bun, with lettuce, jalapeno & spicy Knockout sauce, and melted cheddar cheese on top.'),
  ('134734', 'كاجون🌶️', 'Cajun🌶️', 'شرائح صدر دجاج مطبوخة مع البصل والمشروم وصوص الكاجون الكريمي الحار، وفوقها جبنة موتزاريلا سايحة.', 'Chicken breast slices cooked with onion, mushroom & creamy spicy Cajun sauce, and melted mozzarella cheese on top.'),
  ('134736', 'بيكاسو', 'Picasso', 'شرائح صدر دجاج مطبوخة مع المشروم وصوص الطماطم المجففة الكريمي الخاص، وفوقها جبنة موتزاريلا سايحة.', 'Chicken breast slices cooked with mushroom & Special creamy sun-dried tomato sauce, and melted mozzarella cheese on top.'),
  ('134739', 'بيستو', 'Pesto', 'شرائح صدر دجاج مطبوخة مع المشروم والزيتون الأسود وصوص البيستو الكريمي، وفوقها جبنة موتزاريلا سايحة.', 'Chicken breast slices cooked with mushroom, black olive & creamy Pesto sauce, and melted mozzarella cheese on top.'),
  ('155364', 'كيدز بوكس', 'Kids Box', '- برجر لحم أو دجاج حجم وسط مع جبنة شيدر أمريكي وصوص وستروس، مع بطاطس وعصير طبيعي ولعبة. - أو تشكن ناجتس مع بطاطس وعصير طبيعي ولعبة.', '- Beef or Chicken medium size burger with American cheddar cheese & Westeros sauce, with fries, pure juice & toy. - Or Chicken Nuggets with fries, pure juice & toy.'),
  ('160337', 'بندل 1', 'Bundle 1', 'ستارك تشكن برجر + تشيز فرايز + V7 كولا', 'Stark Chicken Burger + Cheese Fries + V7 Cola'),
  ('160338', 'بندل 2', 'Bundle 2', 'كلاسيك دبل تشكن برجر (300 جم) + سلطة كولسلو + كرانشي كيك', 'Classic Double Chicken Burger (300gm) + Cole slaw Salad + Crunchy Cake'),
  ('160339', 'بندل 3', 'Bundle 3', 'ساندويتش كولونيل + ألفريدو فرايز + تروبيكال صودا إيطالي', 'Colonel Sandwich + Alfredo Fries + Tropical Italian Soda'),
  ('160340', 'بندل 4', 'Bundle 4', '2 برجر دجاج مشوي (كلاسيك، سموكي أو ستارك) + شير بوكس + 2 V7 كولا', '2 Grilled Chicken Burgers (Classic, Smoky, Stark) + Share Box + 2 V7 Cola'),
  ('90122', 'ديو بيف بوكس', 'Duo Beef Box', '2 برجر لحم من اختيارك + بطاطس + 2 صوص + 2 مشروب غازي.', '2 Beef Burgers of your choice + fries + 2 sauces + 2 soft drinks.'),
  ('90123', 'ديو تشكن بوكس', 'Duo Chicken Box', '2 برجر دجاج من اختيارك + بطاطس + 2 صوص + 2 مشروب غازي.', '2 Chicken Burgers of your choice + fries + 2 sauces + 2 soft drinks.'),
  ('90125', 'شير بوكس', 'Share Box', '4 تشكن ناجتس + 4 حلقات بصل + 4 ميني شيدر هالبينو + 2 أصابع موتزاريلا + بطاطس + 2 صوص.', '4 Chicken Nuggets + 4 Onion Rings + 4 Cheddar Jalapeno minis + 2 Mozzarella Sticks + Fries + 2 Sauces.'),
  ('153225', 'سناك بوكس', 'Snack Box', 'برجر لحم أو دجاج حجم وسط مع جبنة شيدر أمريكي وصوص وستروس، مع بطاطس وكولا صغيرة.', 'Beef or Chicken medium size burger with American cheddar cheese and Westeros sauce with fries & small cola'),
  ('154507', 'كارديو دايت ميل', 'Cardio Diet Meal', 'صدر دجاج مشوي (200 جم)، أرز بسمتي بالخضار (570 سعر حراري - 53 جم بروتين - 63 جم كربوهيدرات - 14 جم دهون)', 'Grilled Chicken Breast (200g), Basmati rice with vegetables (570 Calories - 53g Protein - 63g Carbohydrates - 14g Fats)'),
  ('153227', 'دمبلز دايت ميل', 'Dumbbells Diet Meal', 'صدر دجاج مشوي (200 جم)، ذرة حلوة، خس، طماطم، مخلل وهالبينو. (350 سعر حراري - 50 جم بروتين - 20 جم كربوهيدرات - 5 جم دهون)', 'Grilled Chicken Breast (200gm), Sweet corn, lettuce, tomato, pickles & Jalapenos. (350 Calories - 50g Protein - 20g Carbohydrates - 5g Fats)'),
  ('153226', 'كيدز بوكس', 'Kids Box', 'برجر لحم أو دجاج أو كرسبي حجم وسط مع جبنة شيدر أمريكي وصوص وستروس وخس، مع بطاطس وعصير طبيعي ولعبة.', 'Beef, Chicken or Crispy medium size burger with American cheddar cheese, Westeros sauce and lettuce, with fries, pure juice & toy.'),
  ('154962', 'دمبلز دايت ميل', 'Dumbbells Diet Meal', 'صدر دجاج مشوي (200 جم)، ذرة حلوة، خس، طماطم، مخلل وهالبينو. (350 سعر حراري - 50 جم بروتين - 20 جم كربوهيدرات - 5 جم دهون)', 'Grilled Chicken Breast (200gm), Sweet corn, lettuce, tomato, pickles & Jalapenos. (350 Calories - 50g Protein - 20g Carbohydrates - 5g Fats)'),
  ('154963', 'كارديو دايت ميل', 'Cardio Diet Meal', 'صدر دجاج مشوي (200 جم)، أرز بسمتي بالخضار (570 سعر حراري - 53 جم بروتين - 63 جم كربوهيدرات - 14 جم دهون)', 'Grilled Chicken Breast (200g), Basmati rice with vegetables (570 Calories - 53g Protein - 63g Carbohydrates - 14g Fats)'),
  ('159440', 'مكس دايت ميل', 'Mix Diet Meal', 'صدر دجاج مشوي (200 جم)، أرز بسمتي، ذرة حلوة، طماطم، مخلل وهالبينو. (635 سعر حراري - 55 جم بروتين - 75 جم كربوهيدرات - 15 جم دهون)', 'Grilled Chicken Breast (200gm), Basmati Rice, Sweet corn, tomato, pickles & Jalapenos. (635Calories - 55g Protein - 75g Carbohydrates - 15g Fats)'),
  ('154964', 'سلطة فتنيس', 'Fitness Salad', 'خس، جرجير، بصل مخلل، فاصوليا حمراء وصوص الليمون. (170 سعر حراري - 11 جم بروتين - 30 جم كربوهيدرات - 0.5 جم دهون)', 'Lettuce, Rocca, Pickled onion, Kidney bean & Lemon sauce. (170 Calories - 11g Protein - 30g Carbohydrates - 0.5g Fats)'),
  ('90129', 'تشيز فرايز', 'Cheese Fries', 'بطاطس وفوقها صوص جبنة شيدر وهالبينو.', 'Fries with cheddar cheese sauce & jalapeno on top.'),
  ('90130', 'ديناميت فرايز 🌶️', 'Dynamite Fries 🌶️', 'بطاطس وفوقها صوص جبنة شيدر وقطع دجاج كرسبي مع صوص ديناميت وصوص رانش.', 'Fries with cheddar cheese sauce on top and crispy chicken bites with Dynamite & Ranch sauces.'),
  ('90131', 'باربكيو فرايز', 'BBQ Fries', 'بطاطس وفوقها صوص جبنة شيدر، ولحمة مفرومة، صوص باربكيو وهالبينو.', 'Fries with cheddar cheese sauce on top, and minced meat, BBQ sauce & jalapeno'),
  ('134740', 'ألفريدو فرايز', 'Alfredo Fries', 'بطاطس مع صوص ألفريدو بالمشروم الكريمي، وفوقها جبنة موتزاريلا سايحة.', 'Fries with creamy mushroom Alfredo sauce, on top melted mozzarella cheese.'),
  ('134743', 'كاوبوي فرايز', 'Cowboy Fries', 'بطاطس مع صوص الطماطم المجففة الكريمي الخاص، هالبينو وشرائح سلامي، وفوقها جبنة موتزاريلا سايحة.', 'Fries with Special creamy sun-dried tomato sauce, jalapeno & salami slices, and melted mozzarella cheese on top.'),
  ('160564', 'تشكن ناجيتس', 'Chicken Nuggets', 'صدر دجاج مفروم متغطي بالبقسماط البانكو المقرمش. (6 قطع)', 'Minced chicken breast coated with crunchy panko breadcrumbs. (6 Pieces)'),
  ('90132', 'ديناميت بايتس 🌶️', 'Dynamite Bites 🌶️', 'قطع دجاج كرسبي بصوص الديناميت مع خس.', 'Crispy chicken bites with dynamite sauce with lettuce'),
  ('90133', 'ستارك بايتس', 'Stark Bites', 'قطع دجاج كرسبي مغموسة بصوص ستارك مع خس.', 'Crispy chicken bites dipped in stark sauce with lettuce'),
  ('90134', 'كرسبي بايتس', 'Crispy Bites', 'قطع فيليه دجاج كرسبي.', 'Crispy chicken fillet pieces'),
  ('154508', 'سلطة فتنيس', 'Fitness Salad', 'خس، جرجير، بصل مخلل، فاصوليا حمراء وصوص الليمون. (170 سعر حراري - 11 جم بروتين - 30 جم كربوهيدرات - 0.5 جم دهون)', 'Lettuce, Rocca, Pickled onion, Kidney bean & Lemon sauce. (170 Calories - 11g Protein - 30g Carbohydrates - 0.5g Fats)'),
  ('135267', 'سلطة سيزر بالدجاج', 'Chicken Caesar Salad', 'خس بصوص السيزر، وفوقه صدر دجاج مشوي وجبنة وقطع عيش محمص.', 'Lettuce covered with Caesar sauce, topped with a grilled chicken breast, cheese & toasted bread bites.'),
  ('135268', 'سلطة تشكن رانش', 'Chicken Ranch Salad', 'خس، طماطم، بصل مخلل وزيتون أسود بصوص الرانش، وفوقها صدر دجاج مشوي وناتشوز.', 'Lettuce, tomato, pickled onion & black olive covered with Ranch sauce & toped with a grilled Chicken breast & nachos.'),
  ('101492', 'كولسلو', 'Cole Slaw', 'كرنب، جزر وصوص مايونيز حلو.', 'Cabbage, carrot & sweet mayonnaise sauce.'),
  ('101493', 'سلطة ذرة', 'Mayo Sweet Corn', 'ذرة حلوة، فلفل رومي، مخلل، بصل وشبت مع مايونيز.', 'Sweet corn, paprika, pickle, onion, dill mixed with mayonnaise.'),
  ('157585', 'كرانشي كيك (تشوكليت)', 'Crunchy Cake (Chocolate)', 'كيكة فدج بالشوكولاتة البلجيكي، وفوقها رقائق الفويتين المقرمشة، تتقدم سخنة مع قهوة تركي.', 'Fudge cake with Belgian chocolate, with crunchy Feuilletine flakes on top, Served warm with Turkish coffee.'),
  ('157586', 'كرانشي كيك (لوتس)', 'Crunchy Cake (Lotus)', 'كيكة فدج باللوتس البلجيكي، وفوقها فتات اللوتس، تتقدم سخنة مع قهوة تركي.', 'Fudge cake with Belgian Lotus, with Lotus crumbs on top, Served warm with Turkish coffee.'),
  ('157587', 'كرانشي كيك (الموند)', 'Crunchy Cake (Almond)', 'كيكة فدج بالشوكولاتة البلجيكي البلوند، وفوقها شرائح اللوز المحمص، تتقدم سخنة مع قهوة تركي.', 'Fudge cake with Belgian blonde chocolate, with roasted almond flakes on top, Served warm with Turkish coffee.'),
  ('148638', 'فيزي مانجو موكتيل', 'Fizzy Mango Mocktail', 'بيوريه مانجو وعصير برتقال فريش مع مياه فوارة.', 'Mango puree & fresh Orange juice with sparkling water.'),
  ('148639', 'سمر تشيل موكتيل', 'Summer Chill Mocktail', 'بيوريه خوخ وعصير تفاح أحمر طبيعي مع مياه فوارة.', 'Peach puree & pure Red Apple juice with sparkling water'),
  ('148640', 'بينك هوني ليمونيد موكتيل', 'Pink Honey Lemonade Mocktail', 'عسل، عصير ليمون فريش وشراب الجرينادين مع مياه فوارة.', 'Honey, fresh Lemon juice & Grenadine syrup with sparking water'),
  ('145623', 'موهيتو صودا', 'Mojito Soda', 'شراب الليمون والنعناع مع مياه فوارة.', 'Lemon & Mint syrups with sparking water.'),
  ('145624', 'تروبيكال صودا', 'Tropical Soda', 'بيوريه باشن فروت وشراب الرمان مع مياه فوارة.', 'Passion Fruit puree & Pomegranate syrup with sparkling water.'),
  ('145627', 'انيرجي صودا', 'Energy Soda', 'شراب التوت الأسود والنعناع مع مشروب طاقة.', 'Black Berry & Mint syrup with Energy drink.'),
  ('159315', 'اوبر مشروب طاقة', 'Uber Energy Drink', 'مشروب طاقة تركي', 'Turkish Energy Drink'),
  ('145614', 'عصير مانجو فرش', 'Fresh Mango Juice', '300 ملل', '300 ملل'),
  ('145615', 'عصير برتقال فرش', 'Fresh Orange Juice', '300 ملل', '300 ملل'),
  ('145616', 'عصير فراولة فرش', 'Fresh Strawberry Juice', '300ملل', '300ملل'),
  ('103463', 'V COLA DIET', 'V Cola Diet', 'بدون سكر', 'Zero Sugar'),
  ('133705', 'عرض السناجل', 'Singles Offers', 'بمناسبة السنة الجديدة 2025 اطلب برجر من اختيارك بيف او تشكن مع فرايز وسلطة وصوص وكولا', 'بمناسبة السنة الجديدة 2025 اطلب برجر من اختيارك بيف او تشكن مع فرايز وسلطة وصوص وكولا'),
  ('133706', 'عرض الكبلز', 'Couples Offers', 'بمناسبة السنة الجديدة 2025 اطلب 2 برجر من اختيارك بيف او تشكن مع تشيز فرايز و2 سلطة و2 صوص و2 كولا', 'بمناسبة السنة الجديدة 2025 اطلب 2 برجر من اختيارك بيف او تشكن مع تشيز فرايز و2 سلطة و2 صوص و2 كولا'),
  ('157695', 'رمضان رولز', 'Ramadan Rolls', '6 ميني رابس دجاج محشية بحشوة كريمي من اختيارك: كاجون، بيتزا أو ألفريدو.', '6 mini chicken wraps stuffed with creamy filling of your choice “Cajun, Pizza or Alfrado”'),
  ('159521', 'عرض الكرة الذهبية', 'Golden Ball Bundle', 'وجبة كاملة لشخص: 1 مونديال تشكن برجر + 1 تشيز فرايز + 1 موكتيل + 1 كرانشي كيك', 'Full Meal for 1 Person: 1 Mondial Chicken Burger + 1 Cheese Fries + 1 Mocktail + 1 Crunchy Cake'),
  ('159522', 'عرض رأس الحربة', 'Strikers Bundle', 'وجبة كاملة لشخصين: 4 مونديال تشكن برجر صغير + 2 بطاطس صغير + 2 ميلك شيك', 'Full Meal For 2 Persons: 4 Small Mondial Chicken Burgers + 2 Small Fries + 2 Milkshakes'),
  ('159523', 'عرض المنتخب', 'Football Team Bundle', 'وجبة كاملة لـ 4 أشخاص: 2 مونديال تشكن برجر + 2 ساندويتش كوماندو + 1 ألفريدو فرايز + 4 صودا + 2 سلطة ذرة بالمايونيز.', 'Full Meal for 4 Persons: 2 Mondial Chicken Burgers + 2 Commando Sandwiches + 1 Alfredo Fries + 4 Sodas + 2 Mayo Corn Salad.');

create temporary table bb_side (en text, ar text);
insert into bb_side values
  ('Double Beef (300gm)', 'دبل بيف (300 جم)'),
  ('Triple Beef (450gm)', 'تريبل بيف (450 جم)'),
  ('Combo (Fries + Big Cola)', 'كومبو (بطاطس + كولا كبيرة)'),
  ('Combo (Fries + Coleslaw)', 'كومبو (بطاطس + كولسلو)'),
  ('Combo (Fries + V Cola)', 'كومبو (بطاطس + V كولا)'),
  ('Add 2 Mozzarella Sticks', 'إضافة 2 أصابع موتزاريلا'),
  ('Add 2 Onion Rings', 'إضافة 2 حلقات بصل'),
  ('Add Cheddar Sauce', 'إضافة صوص شيدر'),
  ('Add American Cheese Slice', 'إضافة شريحة جبنة أمريكي'),
  ('Add Salami Slice', 'إضافة شريحة سلامي'),
  ('Add Jalapeno', 'إضافة هالبينو'),
  ('Spicy', 'سبايسي (حار)'),
  ('Without Cheese', 'بدون جبنة'),
  ('Without Onion', 'بدون بصل'),
  ('Without Tomato', 'بدون طماطم'),
  ('Without Lettuce', 'بدون خس'),
  ('Without Mayo/Sauce', 'بدون مايونيز/صوص'),
  ('Without Pickles', 'بدون مخلل'),
  ('Double Chicken (300gm)', 'دبل تشكن (300 جم)'),
  ('Triple Chicken (450gm)', 'تريبل تشكن (450 جم)'),
  ('Extra Grilled Chicken', 'دجاج مشوي زيادة'),
  ('Single Crispy', 'سينجل كرسبي'),
  ('Double Crispy (2 Pieces)', 'دبل كرسبي (قطعتين)'),
  ('Triple Crispy (3 Pieces)', 'تريبل كرسبي (3 قطع)'),
  ('Extra Cheese', 'جبنة زيادة'),
  ('Extra Jalapeno', 'هالبينو زيادة'),
  ('Without Mushroom', 'بدون مشروم'),
  ('Beef Burger', 'برجر لحم'),
  ('Chicken Burger', 'برجر دجاج'),
  ('Chicken Nuggets', 'تشكن ناجتس'),
  ('Boy toy', 'لعبة ولد'),
  ('Girl toy', 'لعبة بنت'),
  ('Apple Juice', 'عصير تفاح'),
  ('Mango Juice', 'عصير مانجو'),
  ('Grape Juice', 'عصير عنب'),
  ('Classic Chicken Burger', 'كلاسيك تشكن برجر'),
  ('Smokey Chicken Burger', 'سموكي تشكن برجر'),
  ('Stark Chicken Burger', 'ستارك تشكن برجر'),
  ('Ranch Sauce', 'صوص رانش'),
  ('Knock Out Sauce', 'صوص نوك آوت'),
  ('Dynamite Sauce', 'صوص ديناميت'),
  ('Stark Sauce', 'صوص ستارك'),
  ('BBQ Sauce', 'صوص باربكيو'),
  ('Cheddar Cheese Sauce', 'صوص جبنة شيدر'),
  ('Westeros Sauce', 'صوص وستروس'),
  ('Classic Beef Burger', 'كلاسيك بيف برجر'),
  ('Smokey Beef Burger', 'سموكي بيف برجر'),
  ('White Mushroom Beef Bruger', 'وايت مشروم بيف برجر'),
  ('Stark Beef Burger', 'ستارك بيف برجر'),
  ('Mondial Beef Burger', 'مونديال بيف برجر'),
  ('Brownie Beef Burger', 'براوني بيف برجر'),
  ('White Mushroom Chicken Bruger', 'وايت مشروم تشكن برجر'),
  ('Mondial Chicken Burger', 'مونديال تشكن برجر'),
  ('Beef Snack Burger', 'سناك برجر لحم'),
  ('Chicken Snack Burger', 'سناك برجر دجاج'),
  ('Combo (Fitness Salad+Fresh Orange Juice)', 'كومبو (سلطة فتنيس + عصير برتقال فريش)'),
  ('Combo (Fitness Salad+V7 Diet Cola)', 'كومبو (سلطة فتنيس + V7 كولا دايت)'),
  ('Crispy Kids Burger', 'برجر كرسبي للأطفال'),
  ('Tea instead of Coffee', 'شاي بدل القهوة'),
  ('Add Icecream Vanilla', 'إضافة آيس كريم فانيليا'),
  ('Add Icecream Chocolate', 'إضافة آيس كريم شوكولاتة'),
  ('V7 Cola', 'V7 كولا'),
  ('V7 Cola Diet', 'V7 كولا دايت'),
  ('V7 Lemon', 'V7 ليمون'),
  ('V7 Pink Lemonade', 'V7 بينك ليمونيد'),
  ('Chicken Cajun', 'تشكن كاجون'),
  ('Chicken Pizza', 'تشكن بيتزا'),
  ('Chicken Alfredo', 'تشكن ألفريدو'),
  ('Fizzy Mango Mocktail', 'فيزي مانجو موكتيل'),
  ('Summer Chill Mocktail', 'سمر تشيل موكتيل'),
  ('Pink Honey Lemonade Mocktail', 'بينك هوني ليمونيد موكتيل'),
  ('Crunchy Cake (Chocolate)', 'كرانشي كيك (تشوكليت)'),
  ('Crunchy Cake (Lotus)', 'كرانشي كيك (لوتس)'),
  ('Crunchy Cake (Almond)', 'كرانشي كيك (الموند)'),
  ('Pistachio Milkshake', 'ميلك شيك فستق'),
  ('Caramel Popcorn Milkshake', 'ميلك شيك كراميل بوب كورن'),
  ('Cheese Cake Milkshake', 'ميلك شيك تشيز كيك'),
  ('Mojito Soda', 'موهيتو صودا'),
  ('Tropical Soda', 'تروبيكال صودا'),
  ('Energy Soda', 'انيرجي صودا');

-- 1) الأصناف برقم Bonbell
update public.menu_items m
set description = jsonb_build_object('ar', t.desc_ar, 'en', t.desc_en), updated_at = now()
from bb_desc t
where m.external_ref = t.ref
  and m.description is distinct from jsonb_build_object('ar', t.desc_ar, 'en', t.desc_en);

-- 2) نسخ الفروع وباقي الأصناف بالاسم (لو الاسم متكرر في Bonbell بناخد آخر واحد)
update public.menu_items m
set description = jsonb_build_object('ar', t.desc_ar, 'en', t.desc_en), updated_at = now()
from (select distinct on (name_ar) * from bb_desc order by name_ar, ref desc) t
where (m.external_ref is null or m.external_ref not in (select ref from bb_desc))
  and (btrim(m.name->>'ar') = btrim(t.name_ar) or lower(btrim(m.name->>'en')) = lower(btrim(t.name_en)))
  and m.description is distinct from jsonb_build_object('ar', t.desc_ar, 'en', t.desc_en);

-- 3) الخيارات الجانبية في ثوابت المنيو
update public.mfg_settings s
set lists = jsonb_set(s.lists, '{sideOptions}', (
  select coalesce(jsonb_agg(
    case when t.ar is not null and (coalesce(btrim(o->>'nameAr'), '') = '' or btrim(o->>'nameAr') = btrim(o->>'name'))
         then o || jsonb_build_object('nameAr', t.ar) else o end
    order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(s.lists->'sideOptions') with ordinality e(o, ord)
  left join bb_side t on lower(btrim(t.en)) = lower(btrim(o->>'name'))
)), updated_at = now()
where jsonb_typeof(s.lists->'sideOptions') = 'array';

-- 4) الخيارات على الأصناف (كل الفروع): الاسم العربي من الخيار الجانبي
update public.modifiers m
set name = jsonb_set(m.name, '{ar}', to_jsonb(t.ar)), updated_at = now()
from bb_side t
where lower(btrim(m.name->>'en')) = lower(btrim(t.en))
  and (coalesce(btrim(m.name->>'ar'), '') = '' or btrim(m.name->>'ar') = btrim(m.name->>'en'));
