/**
 * Project photos cropped from the Artist pack poster, keyed by the project names the backend seeds.
 * A project with no photo here (or an admin-set picture link) falls back to a placeholder icon.
 */
export const LIVE_PROJECT_PHOTOS: Record<string, number> = {
  "Flower": require('../../assets/live-projects/flower.jpg'),
  "Keychain": require('../../assets/live-projects/keychain.jpg'),
  "Hairclip": require('../../assets/live-projects/hairclip.jpg'),
  "Hair band": require('../../assets/live-projects/hair-band.jpg'),
  "Coin pouch (no zip)": require('../../assets/live-projects/coin-pouch.jpg'),
  "Headband": require('../../assets/live-projects/headband.jpg'),
  "Mobile pouch": require('../../assets/live-projects/mobile-pouch.jpg'),
  "Flowers making": require('../../assets/live-projects/flowers-making.jpg'),
  "Kids cap": require('../../assets/live-projects/kids-cap.jpg'),
  "Bow making": require('../../assets/live-projects/bow-making.jpg'),
  "Slim zip pouch": require('../../assets/live-projects/slim-zip-pouch.jpg'),
  "Crochet crop top": require('../../assets/live-projects/crochet-crop-top.jpg'),
  "Kids baby sweater set": require('../../assets/live-projects/kids-sweater-set.jpg'),
  "Crochet lunch bag": require('../../assets/live-projects/crochet-lunch-bag.jpg'),
  "Amigurumi doll": require('../../assets/live-projects/amigurumi-doll.jpg'),
};
