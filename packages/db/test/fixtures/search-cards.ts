import type { ItemCreateInput } from '@pb/shared';

/**
 * D81: the search fixture deck (three languages, every card type) used by `pnpm test:search`
 * and written to a deployed `search-demo` deck by `pnpm search:load` (D82). Separate from
 * `sample-cards.ts` so its counts stay stable. Keys are what `search-eval.json` expects.
 */
export interface SearchCard {
  key: string;
  lang: 'he' | 'el' | 'en';
  card: ItemCreateInput;
}

function text(key: string, lang: SearchCard['lang'], title: string, body: string): SearchCard {
  return { key, lang, card: { type: 'text', title, body, payload: {} } };
}

function link(
  key: string,
  lang: SearchCard['lang'],
  title: string,
  body: string,
  url: string,
): SearchCard {
  return { key, lang, card: { type: 'link', title, body, payload: { url } } };
}

export const searchCards: SearchCard[] = [
  text(
    'dentist',
    'en',
    'Dentist — Dr. Levi',
    'Family dentist on Herzl St. Call 054-7712345 for appointments; cleaning every six months.',
  ),
  text(
    'parking',
    'en',
    'Visiting grandma',
    'Free parking behind the building on Rothschild; the blue zone is paid on weekdays.',
  ),
  {
    key: 'school-pickup',
    lang: 'en',
    card: {
      type: 'table',
      title: 'School pickup times',
      body: 'Pickup from the Ganim school gate.',
      payload: {
        columns: ['Day', 'Pickup'],
        rows: [
          ['Sunday–Thursday', '13:30'],
          ['Friday', '12:00'],
        ],
      },
    },
  },
  text('wifi', 'en', 'Wifi password', 'Network Niran-Home; the password is on the router sticker.'),
  text(
    'pediatrician',
    'he',
    'רופאת ילדים ד"ר כהן',
    'קופת חולים מכבי, טלפון 03-6123456, קבלה בימים א׳-ה׳',
  ),
  text('pharmacy-he', 'he', 'בית מרקחת תורן', 'בית המרקחת בשכונה פתוח עד חצות ביום שישי'),
  text(
    'garbage',
    'en',
    'Garbage and recycling',
    'Bins go out on Monday and Thursday evenings; the orange bin is for packaging.',
  ),
  text('plumber', 'en', 'Plumber — Yossi', 'Fixed the boiler last winter. 052-9988776.'),
  link(
    'electricity',
    'en',
    'Electricity company outage map',
    'Check power outages in our street.',
    'https://www.iec.co.il/outages',
  ),
  text(
    'car-insurance',
    'en',
    'Car insurance policy',
    'Policy number 4471-22 renews every March; the agent is Dana.',
  ),
  {
    key: 'vaccinations',
    lang: 'en',
    card: {
      type: 'image',
      title: 'Vaccination record',
      body: 'Photo of the vaccination booklet; bring it to the clinic.',
      payload: { publicId: 'search-fixtures/vaccinations', alt: 'Vaccination booklet' },
    },
  },
  {
    key: 'rice',
    lang: 'en',
    card: {
      type: 'calc',
      title: 'Rice cooker ratio',
      body: 'One and a half cups of water for every cup of rice.',
      payload: {
        fields: [{ key: 'cups', label: 'Cups of rice', default: 2 }],
        expression: 'cups * 1.5',
        resultLabel: 'Cups of water',
      },
    },
  },
  text('candles', 'he', 'הדלקת נרות שבת', 'זמני הדלקת הנרות בתל אביב משתנים כל שבוע'),
  text('grandma-phone', 'el', 'Τηλέφωνο γιαγιάς', 'Η γιαγιά Ελένη στην Αθήνα: +30 210 5551234'),
  text(
    'moussaka',
    'el',
    'Συνταγή για μουσακά',
    'Μελιτζάνες, κιμάς, μπεσαμέλ. Ψήνουμε 45 λεπτά στους 180 βαθμούς.',
  ),
  text('pharmacy-el', 'el', 'Φαρμακείο της γειτονιάς', 'Ανοιχτό μέχρι τις 9 το βράδυ'),
  text(
    'vet',
    'en',
    'Vet for Shoko the dog',
    'Dr. Amir at the animal clinic; the yearly rabies shot is in May.',
  ),
  text('babysitter', 'en', 'Babysitter Noa', 'Free on Tuesday evenings, 50 an hour, 050-3334455.'),
  text('swimming', 'he', 'חוג שחייה', 'יום רביעי בשעה 17:00 בבריכה העירונית'),
  link(
    'passport',
    'en',
    'Passport renewal',
    'Book an appointment at the population authority; bring the old passport and a photo.',
    'https://www.gov.il/passport',
  ),
  text('garage', 'en', 'Car service garage', 'Garage on HaMasger St; oil change every 15,000 km.'),
  {
    key: 'emergency',
    lang: 'he',
    card: {
      type: 'table',
      title: 'מספרי חירום',
      body: '',
      payload: {
        columns: ['שירות', 'מספר'],
        rows: [
          ['משטרה', '100'],
          ['מד"א', '101'],
          ['כיבוי אש', '102'],
        ],
      },
    },
  },
  text('bus', 'en', 'Bus to school', 'Line 25 from the corner stop at 07:40.'),
  text('gifts', 'en', 'Birthday gift ideas', 'A Lego set, a bike helmet, art supplies.'),
  link(
    'tax-refund',
    'en',
    'Annual tax refund',
    'Submit form 135 before December.',
    'https://www.gov.il/tax-refund',
  ),
  text('internet', 'he', 'ספק האינטרנט', 'בזק, מספר לקוח 889911, תמיכה טכנית *199'),
  text('water-bill', 'en', 'Water bill', 'Paid by standing order every two months.'),
  text(
    'school-hours-el',
    'el',
    'Σχολείο — ώρες',
    'Τα μαθήματα αρχίζουν στις 8:00 και τελειώνουν στις 13:30.',
  ),
  text(
    'piano',
    'en',
    'Piano lessons',
    'Teacher Miriam on Sundays at 16:00; practice 20 minutes a day.',
  ),
  text(
    'allergies',
    'en',
    'Allergies',
    'Tom is allergic to peanuts and penicillin. The EpiPen is in the kitchen drawer.',
  ),
  text(
    'alarm',
    'en',
    'Alarm code',
    'Disarm on the keypad by the door; the security company is Moked 24.',
  ),
  text('neighbors', 'he', 'שכנים', 'רינה מקומה 3 מחזיקה אצלה מפתח רזרבי לדירה'),
  link(
    'taverna',
    'el',
    'Ταβέρνα στο λιμάνι',
    'Φρέσκο ψάρι, κράτηση το Σάββατο.',
    'https://example.com/taverna',
  ),
  text('gym', 'en', 'Gym membership', 'Membership card number 77120; closed on Saturdays.'),
  text('laundry', 'en', 'Laundry tips', 'Wool on cold, towels at 60 degrees.'),
  text('kindergarten', 'he', 'גן ילדים', 'הגננת שרית, איסוף עד 16:00, ביום שישי עד 12:00'),
  {
    key: 'tip',
    lang: 'en',
    card: {
      type: 'calc',
      title: 'Restaurant tip',
      body: 'Twelve percent of the bill.',
      payload: {
        fields: [{ key: 'bill', label: 'Bill', default: 200 }],
        expression: 'bill * 0.12',
        resultLabel: 'Tip',
      },
    },
  },
  text(
    'family-doctor',
    'en',
    'Family doctor',
    'Dr. Shapiro at the Maccabi clinic; renew prescriptions online.',
  ),
  text('bank', 'en', 'Bank branch', 'Leumi branch 802; the account manager is Ofer.'),
  text(
    'plants',
    'en',
    'Plant watering',
    'Water the basil every two days and the ficus once a week.',
  ),
];
