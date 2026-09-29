import type { ItemCreateInput } from '@pb/shared';

export interface SeedCard {
  key: string;
  categories: string[];
  status: 'published' | 'archived';
  favorite?: boolean;
  lang: 'he' | 'el' | 'en';
  card: ItemCreateInput;
}

export const seedCards: SeedCard[] = [
  // FOOD CARDS (12 total, all published)

  // Meal plan table
  {
    key: 'family/food/weekly-meal-plan',
    categories: ['food'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'table',
      title: 'תוכנית ארוחות שבועית',
      body: 'תוכנית ארוחות מתוכננת לשבוע זה כדי לתכנן קניות ובישול בעיתוד',
      payload: {
        columns: ['Day', 'Lunch', 'Dinner'],
        rows: [
          ['Monday', 'Falafel & hummus', 'Fish with tomato sauce'],
          ['Tuesday', 'Omelette & vegetables', 'Roasted chicken with potatoes'],
          ['Wednesday', 'Lentil soup', 'Pasta with cheese'],
          ['Thursday', 'Salad & cheese', 'Beef steak with rice'],
          ['Friday', 'Fish & vegetables', 'Schnitzel with golden potatoes'],
          ['Saturday', 'Roasted chicken', 'Salads & dolmades'],
          ['Sunday', 'Spaghetti bolognese', 'Grilled vegetables & moussaka'],
        ],
      },
      status: 'published',
    },
  },

  // Recipe scaling calculator
  {
    key: 'family/food/recipe-scaling',
    categories: ['food'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'calc',
      title: 'Recipe Scaling Calculator',
      body: 'Quickly scale recipes up or down based on serving size. Multiply all ingredients proportionally.',
      payload: {
        fields: [
          { key: 'servings', label: 'Servings', default: 4 },
          { key: 'grams', label: 'Grams per serving', unit: 'g', default: 120 },
        ],
        expression: 'servings * grams',
        resultLabel: 'Total grams',
      },
      status: 'published',
    },
  },

  // Souvlaki place - favorite
  {
    key: 'family/food/souvlaki-place',
    categories: ['food'],
    status: 'published',
    favorite: true,
    lang: 'el',
    card: {
      type: 'link',
      title: 'Αγαπημένο σουβλακιδικό',
      body: 'Το καλύτερο σουβλακιδικό στην περιοχή μας με φρέσκια κρέα και αυθεντικές σάλτσες',
      payload: {
        url: 'https://example.com/souvlaki',
      },
      status: 'published',
    },
  },

  // Smoothie bowl recipe
  {
    key: 'family/food/smoothie-bowl',
    categories: ['food'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'קערית סמוזי לארוחת בוקר',
      body: 'קערית בריאה וטעימה עם יוגורט, פירות קפואים ודגניות. מוכנה בשתי דקות בלבד. מושלמת לשחזור האנרגיה בבוקר',
      payload: {},
      status: 'published',
    },
  },

  // Homemade pesto
  {
    key: 'family/food/homemade-pesto',
    categories: ['food'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'פסטו ביתי מעלה בזיליקום',
      body: 'רסיפה לפסטו אמיתית עם בזיליקום טרי, אגוזי אורן, שום וגבינת פרמזן. אחסן בצנצנת זכוכית בקירור עד שבועיים',
      payload: {},
      status: 'published',
    },
  },

  // Tzatziki sauce
  {
    key: 'family/food/tzatziki-sauce',
    categories: ['food'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'text',
      title: 'Homemade Tzatziki Dip',
      body: 'Creamy Greek yogurt mixed with grated cucumber, garlic, dill and olive oil. Perfect for souvlaki, grilled vegetables, or as a party dip. Best served cold.',
      payload: {},
      status: 'published',
    },
  },

  // Falafel tips
  {
    key: 'family/food/falafel-tips',
    categories: ['food'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'סוד הפלאפל הטוב',
      body: 'טיפים לבישול פלאפל קריספי: שימוש בקט לבן טרי, הקפאה לפני טיגון וטמפרטורה גבוהה. לא תשתמשו בשימורים משום שהם עדינים מדי',
      payload: {},
      status: 'published',
    },
  },

  // Olive oil storage
  {
    key: 'family/food/olive-oil-storage',
    categories: ['food'],
    status: 'published',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Αποθήκευση ελαιολάδου',
      body: 'Φυλάξτε το πρίμιουμ ελαιόλαδο σε δροσερό σκοτεινό χώρο μακριά από θερμότητα και φως. Οι γυάλινες φιάλες είναι καλύτερες. Διατηρείται για 18-24 μήνες',
      payload: {},
      status: 'published',
    },
  },

  // Pasta portions
  {
    key: 'family/food/pasta-portions',
    categories: ['food'],
    status: 'published',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Σωστές μερίδες ζυμαρικών',
      body: 'Για κάθε άτομο υπολογίστε περίπου 80-100 γραμμάρια ξηρά ζυμαρικά. Η μια σούπα χόντρου ζυμαρικών ισούται με περίπου 100g',
      payload: {},
      status: 'published',
    },
  },

  // Kids lunchbox ideas
  {
    key: 'family/food/lunchbox-ideas',
    categories: ['food'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'text',
      title: 'Packing Healthy School Lunches',
      body: 'Sandwich or wrap with protein, fresh vegetables, fruit, yogurt and a treat. Avoid high-sugar snacks. Rotate meals weekly to prevent boredom',
      payload: {},
      status: 'published',
    },
  },

  // Slow cooker tips
  {
    key: 'family/food/slow-cooker-tips',
    categories: ['food'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'טיפים לבישול בסיר אט',
      body: 'בשר מעבה לוקח כ-6-8 שעות בחום נמוך. מזגו מרק בחזקה 2-3 כוסות. הוסיפו ירקות בשלב מאוחר יותר כדי למנוע צמקות',
      payload: {},
      status: 'published',
    },
  },

  // Kids snacks
  {
    key: 'family/food/kids-snacks',
    categories: ['food'],
    status: 'published',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Υγιεινά σνακ για παιδιά',
      body: 'Φρέσκα φρούτα, ελληνικό γιαούρτι, ξηροί καρποί, καροτάκια και χούμους. Αποφύγετε υψηλή περιεκτικότητα σακχάρου',
      payload: {},
      status: 'published',
    },
  },

  // SCHOOL CARDS (3 total)

  // School timetable
  {
    key: 'family/school/school-timetable',
    categories: ['school'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'table',
      title: 'לוח זמנים בית ספר',
      body: 'לוח זמנים יומי של השיעורים והפעילויות בבית הספר',
      payload: {
        columns: ['Day', 'Start', 'End', 'Notes'],
        rows: [
          ['Monday', '8:30 AM', '3:30 PM', 'Sports class'],
          ['Tuesday', '8:00 AM', '2:00 PM', 'Short day'],
          ['Wednesday', '8:30 AM', '3:30 PM', ''],
          ['Thursday', '8:30 AM', '4:00 PM', 'Math club'],
          ['Friday', '8:30 AM', '1:30 PM', ''],
        ],
      },
      status: 'published',
    },
  },

  // Homework checklist
  {
    key: 'family/school/homework-checklist',
    categories: ['school'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'text',
      title: 'Daily Homework Checklist',
      body: "Check that all assignments are written down from the board. Review what's due each day. Set aside 1-2 hours after school for homework",
      payload: {},
      status: 'published',
    },
  },

  // School supplies (archived)
  {
    key: 'family/school/school-supplies',
    categories: ['school'],
    status: 'archived',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Λίστα σχολικών ειδών',
      body: 'Σημειωματάρια, στυλό, μολύβια, χάρακα, κόλλα, ψαλίδι. Ελέγξτε με τον δάσκαλο για συγκεκριμένες απαιτήσεις',
      payload: {},
      status: 'archived',
    },
  },

  // HEALTH CARDS (3 total)

  // Vaccination record
  {
    key: 'family/health/vaccination-card',
    categories: ['health'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'image',
      title: "Children's Vaccination Record",
      body: 'Important record of all vaccinations administered. Keep this safe and bring to medical appointments and school',
      payload: {
        publicId: 'samples/deck/vaccination-card',
        alt: 'Vaccination card',
      },
      status: 'published',
    },
  },

  // Pediatrician hours
  {
    key: 'family/health/pediatrician-hours',
    categories: ['health'],
    status: 'published',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Ώρες επίσκεψης παιδιάτρου',
      body: 'Δευτέρα-Παρασκευή 9:00-17:00, Σάββατο 9:00-13:00 με ραντεβού. Περιστατικά έκτακτης ανάγκης διαθέσιμα 24 ώρες',
      payload: {},
      status: 'published',
    },
  },

  // Allergy information
  {
    key: 'family/health/allergy-information',
    categories: ['health'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'מידע על אלרגיות בתא המשפחה',
      body: 'כושר אלרגיה לבוטנים, חלב ודגים בחברי המשפחה. שמור רשימה עדכנית של תרופות היסטוריית אלרגיה. עדכן בקרוב שינויים בבריאות',
      payload: {},
      status: 'published',
    },
  },

  // ADMIN CARDS (3 total)

  // Government portal
  {
    key: 'family/admin/gov-portal',
    categories: ['admin'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'link',
      title: 'Israeli Government Services Portal',
      body: 'Official portal for government services including tax, identity documents, and benefit applications. Bookmark for easy access',
      payload: {
        url: 'https://www.gov.il/',
      },
      status: 'published',
    },
  },

  // Tax documents
  {
    key: 'family/admin/tax-documents',
    categories: ['admin'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'מקום אחסון מסמכים מס',
      body: 'אחסן כל הקבלות, חשבוניות וטפסים מס בתיקייה זו. עדכן שנתי לפני שליחת הדוח. שמור נתונים לתקופה של 7 שנים',
      payload: {},
      status: 'published',
    },
  },

  // Passport renewal (archived)
  {
    key: 'family/admin/passport-renewal',
    categories: ['admin'],
    status: 'archived',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Λίστα ανανέωσης διαβατηρίου',
      body: 'Έγγραφα που απαιτούνται: φωτογραφία, δύο αντίγραφα ταυτότητας, αίτηση. Χρόνος επεξεργασίας 2-4 εβδομάδες',
      payload: {},
      status: 'archived',
    },
  },

  // HOME CARDS (2 total)

  // Cleaning schedule
  {
    key: 'family/home/cleaning-schedule',
    categories: ['home'],
    status: 'published',
    lang: 'he',
    card: {
      type: 'text',
      title: 'לוח זמנים ניקיון ביתי',
      body: 'שני: חדרי הורים וחדר רחצה. שלישי: מטבח וסלון. רביעי: חדר ילדים. חמישי: ניקיון בדלפק. שישי: ניקיון כללי לשבוע הבא',
      payload: {},
      status: 'published',
    },
  },

  // Guest bedroom arrangement
  {
    key: 'family/home/guest-bedroom-arrangement',
    categories: ['home'],
    status: 'published',
    lang: 'el',
    card: {
      type: 'text',
      title: 'Διάρθρωση κρεβατιού επισκεπτών',
      body: 'Λευκά σεντόνια στο ντουλάπι του δωματίου, μαξιλάρια και κουβέρτες στο κατώτατο ράφι. Πετσέτες κρεμασμένες πάνω από το νιπτήρα',
      payload: {},
      status: 'published',
    },
  },

  // FUN CARDS (2 total)

  // Movie night calendar
  {
    key: 'family/fun/movie-nights',
    categories: ['fun'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'text',
      title: 'Family Movie Night Schedule',
      body: 'Every Friday evening at 7 PM. Rotate movie selection among family members. Prepare snacks beforehand. Suitable for all ages',
      payload: {},
      status: 'published',
    },
  },

  // Birthday calendar
  {
    key: 'family/fun/birthday-calendar',
    categories: ['fun'],
    status: 'published',
    lang: 'en',
    card: {
      type: 'text',
      title: 'Important Birthday Dates',
      body: 'Keep track of all birthdays and anniversaries in the family. Plan celebrations in advance. Leave reminders 2 weeks before to prepare',
      payload: {},
      status: 'published',
    },
  },
];
