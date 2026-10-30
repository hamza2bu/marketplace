// Sample data for local development. Prices are in agorot.

type Names = { he: string; ar: string; en: string };

export type SeedCategory = {
  slug: string;
  name: Names;
  commissionBps?: number;
  children?: { slug: string; name: Names }[];
};

export const categories: SeedCategory[] = [
  {
    slug: "electronics",
    name: { he: "אלקטרוניקה", ar: "إلكترونيات", en: "Electronics" },
    commissionBps: 800,
    children: [
      { slug: "phone-accessories", name: { he: "אביזרים לסלולר", ar: "إكسسوارات الهواتف", en: "Phone accessories" } },
      { slug: "audio", name: { he: "אודיו", ar: "صوتيات", en: "Audio" } },
      { slug: "computers", name: { he: "מחשבים וציוד היקפי", ar: "حواسيب وملحقات", en: "Computers & peripherals" } },
    ],
  },
  {
    slug: "home-kitchen",
    name: { he: "בית ומטבח", ar: "المنزل والمطبخ", en: "Home & kitchen" },
    commissionBps: 1200,
    children: [
      { slug: "kitchen", name: { he: "מטבח", ar: "المطبخ", en: "Kitchen" } },
      { slug: "home-decor", name: { he: "עיצוב הבית", ar: "ديكور المنزل", en: "Home decor" } },
    ],
  },
  {
    slug: "fashion",
    name: { he: "אופנה", ar: "أزياء", en: "Fashion" },
    commissionBps: 1500,
    children: [
      { slug: "men", name: { he: "גברים", ar: "رجال", en: "Men" } },
      { slug: "women", name: { he: "נשים", ar: "نساء", en: "Women" } },
    ],
  },
  {
    slug: "sports",
    name: { he: "ספורט ופנאי", ar: "رياضة وترفيه", en: "Sports & outdoors" },
  },
];

export type SeedShop = {
  key: string;
  owner: { email: string; name: string };
  name: string;
  slug: string;
  description: string;
  legalName: string;
  taxId: string;
  city: string;
};

export const shops: SeedShop[] = [
  {
    key: "tech",
    owner: { email: "seller.tech@example.com", name: "יואב כהן" },
    name: "TechZone",
    slug: "techzone",
    description: "גאדג'טים, אביזרים ואודיו במחירים הוגנים, עם משלוח מהיר מהמחסן בפתח תקווה.",
    legalName: "טק זון בע\"מ",
    taxId: "515000008",
    city: "פתח תקווה",
  },
  {
    key: "home",
    owner: { email: "seller.home@example.com", name: "מרים חדאד" },
    name: "Bayit Design",
    slug: "bayit-design",
    description: "כלי מטבח ועיצוב לבית, נבחרים בקפידה ממעצבים מקומיים.",
    legalName: "בית דיזיין בע\"מ",
    taxId: "515000016",
    city: "חיפה",
  },
  {
    key: "fashion",
    owner: { email: "seller.fashion@example.com", name: "נועה לוי" },
    name: "Urban Wear",
    slug: "urban-wear",
    description: "אופנה יומיומית מבדים איכותיים, בעיצוב תל אביבי.",
    legalName: "אורבן ויר בע\"מ",
    taxId: "515000024",
    city: "תל אביב",
  },
];

export type SeedProduct = {
  shop: string;
  slug: string;
  title: string;
  category: string;
  brand: string;
  price: number;
  compareAt?: number;
  featured?: boolean;
  description: string;
  specs: Record<string, string>;
  // Each axis multiplies the variants: { color: [...], size: [...] }.
  options?: Record<string, string[]>;
  // Optional per-variant prices, in the same order the variants are generated.
  variantPrices?: number[];
};

export const products: SeedProduct[] = [
  // ── TechZone ──
  { shop: "tech", slug: "anc-wireless-headphones", title: "אוזניות אלחוטיות עם סינון רעשים", category: "audio", brand: "SoundMax", price: 34990, compareAt: 44990, featured: true,
    description: "אוזניות Over-Ear עם סינון רעשים אקטיבי, עד 40 שעות סוללה וטעינה מהירה.", specs: { "חיבור": "Bluetooth 5.3", "סוללה": "40 שעות", "משקל": "250 גרם" }, options: { color: ["שחור", "לבן"] } },
  { shop: "tech", slug: "waterproof-bluetooth-speaker", title: "רמקול בלוטות' עמיד במים", category: "audio", brand: "SoundMax", price: 19990,
    description: "רמקול נייד בתקן IPX7 עם סאונד 360 מעלות.", specs: { "עמידות": "IPX7", "סוללה": "12 שעות" }, options: { color: ["כחול", "שחור", "אדום"] } },
  { shop: "tech", slug: "usb-c-65w-fast-charger", title: "מטען מהיר 65W USB-C", category: "phone-accessories", brand: "VoltPro", price: 12990, featured: true,
    description: "מטען GaN קומפקטי עם שתי יציאות USB-C ויציאת USB-A.", specs: { "הספק": "65W", "יציאות": "2×USB-C, 1×USB-A" } },
  { shop: "tech", slug: "braided-usb-c-cable-2m", title: "כבל USB-C קלוע 2 מטר", category: "phone-accessories", brand: "VoltPro", price: 3990,
    description: "כבל קלוע עמיד במיוחד, תומך בטעינה עד 100W.", specs: { "אורך": "2 מטר", "הספק מרבי": "100W" } },
  { shop: "tech", slug: "iphone-15-glass-screen-protector", title: "מגן מסך זכוכית לאייפון 15", category: "phone-accessories", brand: "ShieldX", price: 4990, compareAt: 6990,
    description: "זכוכית מחוסמת 9H עם ערכת התקנה קלה.", specs: { "קשיות": "9H", "תאימות": "iPhone 15" } },
  { shop: "tech", slug: "power-bank-20000mah", title: "סוללה ניידת 20000mAh", category: "phone-accessories", brand: "VoltPro", price: 14990,
    description: "סוללה ניידת עם טעינה מהירה ותצוגת אחוזים דיגיטלית.", specs: { "קיבולת": "20000mAh", "הספק": "22.5W" } },
  { shop: "tech", slug: "ergonomic-wireless-mouse", title: "עכבר אלחוטי ארגונומי", category: "computers", brand: "Clickr", price: 11990,
    description: "עכבר אנכי שמפחית עומס על פרק כף היד, עם חיבור כפול.", specs: { "חיבור": "Bluetooth + 2.4GHz", "DPI": "עד 4000" } },
  { shop: "tech", slug: "rgb-mechanical-keyboard", title: "מקלדת מכנית RGB", category: "computers", brand: "Clickr", price: 38990, featured: true,
    description: "מקלדת מכנית מלאה עם תאורת RGB ומקשים בעברית ובאנגלית.", specs: { "פריסה": "עברית/אנגלית", "תאורה": "RGB" }, options: { switch: ["Red", "Brown", "Blue"] } },
  { shop: "tech", slug: "full-hd-webcam", title: "מצלמת רשת Full HD", category: "computers", brand: "Clickr", price: 22990,
    description: "מצלמת רשת 1080p עם מיקרופון כפול ותיקון תאורה אוטומטי.", specs: { "רזולוציה": "1080p", "מיקרופון": "כפול" } },
  { shop: "tech", slug: "sport-smartwatch", title: "שעון חכם ספורט", category: "phone-accessories", brand: "Pulse", price: 59990, compareAt: 69990,
    description: "שעון חכם עם GPS, מד דופק ועמידות במים עד 50 מטר.", specs: { "GPS": "מובנה", "עמידות במים": "5ATM" }, options: { color: ["שחור", "ירוק זית"] } },

  // ── Bayit Design ──
  { shop: "home", slug: "nonstick-cookware-set-5", title: "סט סירים נון-סטיק 5 חלקים", category: "kitchen", brand: "Cucina", price: 49990, compareAt: 64990, featured: true,
    description: "סט סירים ומחבתות עם ציפוי קרמי, מתאים לכל סוגי הכיריים כולל אינדוקציה.", specs: { "חלקים": "5", "אינדוקציה": "כן" } },
  { shop: "home", slug: "espresso-machine", title: "מכונת קפה אספרסו", category: "kitchen", brand: "Cucina", price: 89990,
    description: "מכונת אספרסו ביתית עם מקציף חלב ולחץ של 15 בר.", specs: { "לחץ": "15 בר", "מיכל מים": "1.5 ליטר" } },
  { shop: "home", slug: "stainless-electric-kettle", title: "קומקום חשמלי נירוסטה", category: "kitchen", brand: "Cucina", price: 17990,
    description: "קומקום 1.7 ליטר עם בקרת טמפרטורה וכיבוי אוטומטי.", specs: { "נפח": "1.7 ליטר", "הספק": "2200W" } },
  { shop: "home", slug: "japanese-knife-set", title: "סט סכינים יפניות", category: "kitchen", brand: "Hamono", price: 34990,
    description: "שלוש סכינים מפלדת דמשק עם מעמד עץ.", specs: { "פלדה": "דמשק", "סכינים": "3" } },
  { shop: "home", slug: "bamboo-cutting-board", title: "קרש חיתוך במבוק", category: "kitchen", brand: "Hamono", price: 7990,
    description: "קרש חיתוך גדול עם תעלה לאיסוף נוזלים.", specs: { "מידות": "45×30 ס\"מ" } },
  { shop: "home", slug: "led-desk-lamp", title: "מנורת שולחן LED", category: "home-decor", brand: "Lumo", price: 15990, featured: true,
    description: "מנורה מתכווננת עם שלושה גווני אור ויציאת USB לטעינה.", specs: { "גווני אור": "3", "עמעום": "כן" }, options: { color: ["לבן", "שחור"] } },
  { shop: "home", slug: "velvet-throw-pillow", title: "כרית נוי קטיפה", category: "home-decor", brand: "Lumo", price: 6990,
    description: "כרית קטיפה רכה 45×45 ס\"מ עם כיסוי נשלף.", specs: { "מידות": "45×45 ס\"מ" }, options: { color: ["ירוק", "חרדל", "ורוד עתיק"] } },
  { shop: "home", slug: "living-room-rug", title: "שטיח סלון", category: "home-decor", brand: "Lumo", price: 69990, compareAt: 89990,
    description: "שטיח ארוג בדוגמה גיאומטרית, נעים למגע וקל לניקוי.", specs: { "חומר": "פוליפרופילן" }, options: { size: ["120×170", "160×230"] }, variantPrices: [49990, 69990] },
  { shop: "home", slug: "handmade-ceramic-vase", title: "אגרטל קרמיקה בעבודת יד", category: "home-decor", brand: "Lumo", price: 12990,
    description: "אגרטל קרמיקה שנוצר בסטודיו בחיפה. כל פריט ייחודי.", specs: { "גובה": "25 ס\"מ" } },
  { shop: "home", slug: "egyptian-cotton-towel-set", title: "סט מגבות כותנה מצרית", category: "home-decor", brand: "Cucina", price: 19990,
    description: "ארבע מגבות כותנה מצרית סופגות במיוחד.", specs: { "חלקים": "4", "חומר": "כותנה מצרית" }, options: { color: ["לבן", "אפור", "כחול"] } },

  // ── Urban Wear ──
  { shop: "fashion", slug: "organic-cotton-tee", title: "חולצת טי כותנה אורגנית", category: "men", brand: "Urban", price: 8990, featured: true,
    description: "חולצת טי בגזרה רגילה מכותנה אורגנית 100%.", specs: { "חומר": "כותנה אורגנית" }, options: { size: ["S", "M", "L", "XL"], color: ["לבן", "שחור"] } },
  { shop: "fashion", slug: "slim-fit-jeans", title: "ג'ינס סלים פיט", category: "men", brand: "Urban", price: 24990,
    description: "ג'ינס בגזרה צרה עם מעט אלסטיות לנוחות.", specs: { "חומר": "98% כותנה, 2% אלסטן" }, options: { size: ["30", "32", "34", "36"] } },
  { shop: "fashion", slug: "oversized-hoodie", title: "קפוצ'ון אוברסייז", category: "men", brand: "Urban", price: 21990, compareAt: 27990,
    description: "קפוצ'ון רחב ונעים עם בטנת פליז.", specs: { "חומר": "80% כותנה, 20% פוליאסטר" }, options: { size: ["S", "M", "L"], color: ["אפור", "שחור"] } },
  { shop: "fashion", slug: "lightweight-running-shoes", title: "נעלי ריצה קלות", category: "sports", brand: "Stride", price: 39990,
    description: "נעלי ריצה קלות עם סוליה בולמת זעזועים.", specs: { "משקל": "240 גרם" }, options: { size: ["40", "41", "42", "43", "44"] } },
  { shop: "fashion", slug: "floral-summer-dress", title: "שמלת קיץ פרחונית", category: "women", brand: "Urban", price: 22990, featured: true,
    description: "שמלת מידי קלילה מוויסקוזה בהדפס פרחוני.", specs: { "חומר": "ויסקוזה" }, options: { size: ["XS", "S", "M", "L"] } },
  { shop: "fashion", slug: "pleated-midi-skirt", title: "חצאית מידי פליסה", category: "women", brand: "Urban", price: 17990,
    description: "חצאית פליסה בגזרה זורמת עם מותן גומי.", specs: { "אורך": "מידי" }, options: { size: ["S", "M", "L"] } },
  { shop: "fashion", slug: "leather-crossbody-bag", title: "תיק צד עור טבעי", category: "women", brand: "Urban", price: 34990,
    description: "תיק צד מעור בקר עם רצועה מתכווננת.", specs: { "חומר": "עור בקר" }, options: { color: ["חום", "שחור"] } },
  { shop: "fashion", slug: "sports-leggings", title: "טייץ ספורט", category: "sports", brand: "Stride", price: 14990, compareAt: 18990,
    description: "טייץ גבוה עם בד נושם ועמיד בכביסות.", specs: { "חומר": "ניילון וספנדקס" }, options: { size: ["XS", "S", "M", "L"] } },
  { shop: "fashion", slug: "baseball-cap", title: "כובע בייסבול", category: "men", brand: "Urban", price: 6990,
    description: "כובע כותנה עם רצועה מתכווננת.", specs: { "מידה": "מתכוונן" }, options: { color: ["שחור", "בז'", "כחול נייבי"] } },
  { shop: "fashion", slug: "silk-scarf", title: "צעיף משי", category: "women", brand: "Urban", price: 11990,
    description: "צעיף משי טבעי בהדפס מקורי.", specs: { "חומר": "משי 100%" }, options: { color: ["טורקיז", "בורדו"] } },
];
