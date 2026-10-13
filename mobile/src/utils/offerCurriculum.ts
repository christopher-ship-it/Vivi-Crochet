/** Marketing "what you'll learn" lists for the three main courses, in bundle order. */
export interface OfferCurriculum {
  level: number;
  label: string;
  emoji: string;
  tagline: string;
  items: string[];
}

export const OFFER_CURRICULUM: OfferCurriculum[] = [
  {
    level: 1,
    label: 'FOUNDATION COURSE',
    emoji: '🧶',
    tagline: 'Start your crochet journey from scratch!',
    items: [
      'Chain Stitch & Slip Knot',
      'Single Crochet',
      'Half Double Crochet',
      'Triple Crochet',
      'Magic Ring',
      'Basic Heart',
      'Basic Flower',
      'Basic Sunflower 🌻',
      'Mini Bow 🎀',
    ],
  },
  {
    level: 2,
    label: 'SIGNATURE COURSE',
    emoji: '🎀',
    tagline: 'Create beautiful and useful handmade products!',
    items: [
      'Large Crochet Bow 🎀',
      'Baby Cap 👶',
      'Stylish Bandana',
      'Cute Coin Pouch 👛',
      'Water Bottle Cover',
    ],
  },
  {
    level: 3,
    label: 'MASTERY COURSE',
    emoji: '👑',
    tagline: 'Take your crochet skills to the next level!',
    items: [
      'Tulip Headband 🌷',
      'Mobile Pouch 📱',
      'Crochet Bouquet 💐',
      "Granny's Pouch 👜",
      'Baby Sweater 🧥',
    ],
  },
];
