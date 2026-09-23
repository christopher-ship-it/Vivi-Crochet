import type { AppLanguage } from './types';
import { fonts as brandFonts } from '../theme';

/** Script-aware UI fonts. Latin display titles use Nunito Bold via brandFonts. */
export function uiFonts(language: AppLanguage) {
  if (language === 'ta') {
    return {
      regular: 'NotoSansTamil_400Regular',
      semiBold: 'NotoSansTamil_600SemiBold',
      extraBold: 'NotoSansTamil_700Bold',
      decorative: 'NotoSansTamil_400Regular',
      nunitoSemi: 'NotoSansTamil_600SemiBold',
      nunitoBold: 'NotoSansTamil_700Bold',
      /** Headings use Noto Bold — Niconne/Tangerine lack Tamil glyphs. */
      heading: 'NotoSansTamil_700Bold',
      tangerine: 'NotoSansTamil_600SemiBold',
      tangerineBold: 'NotoSansTamil_700Bold',
      display: 'NotoSansTamil_700Bold',
    } as const;
  }

  if (language === 'hi') {
    return {
      regular: 'NotoSansDevanagari_400Regular',
      semiBold: 'NotoSansDevanagari_600SemiBold',
      extraBold: 'NotoSansDevanagari_700Bold',
      decorative: 'NotoSansDevanagari_400Regular',
      nunitoSemi: 'NotoSansDevanagari_600SemiBold',
      nunitoBold: 'NotoSansDevanagari_700Bold',
      heading: 'NotoSansDevanagari_700Bold',
      tangerine: 'NotoSansDevanagari_600SemiBold',
      tangerineBold: 'NotoSansDevanagari_700Bold',
      display: 'NotoSansDevanagari_700Bold',
    } as const;
  }

  return brandFonts;
}

export type UiFonts = ReturnType<typeof uiFonts>;
