import {
  createEmptyThemeGradient,
  type ThemeGradientDotMode,
  type ThemeGradientHarmony,
  type ThemeGradientTheme
} from '@yiru/protocol/settings/theme-gradient'

import { applyHarmony } from './pad-geometry'

export type ThemeGradientPreset = {
  id: string
  x: number
  y: number
  lightness: number
  mode: ThemeGradientDotMode
  harmony: ThemeGradientHarmony
  previewBackground: string
}

// Why: the source preset table is anchored to a 360px logical surface even though its field is 358px.
const PICKER_SURFACE_SIZE = 360

type PresetSeed = {
  position: readonly [number, number]
  lightness: number
  previewBackground: string
}

const LIGHT_SEEDS: readonly PresetSeed[] = [
  { position: [240, 240], lightness: 90, previewBackground: '#f4efdf' },
  { position: [233, 157], lightness: 80, previewBackground: '#f0b8cd' },
  { position: [236, 111], lightness: 80, previewBackground: '#e9c3e3' },
  { position: [234, 173], lightness: 70, previewBackground: '#da7682' },
  { position: [220, 187], lightness: 70, previewBackground: '#eb8570' },
  { position: [225, 237], lightness: 60, previewBackground: '#dcce7f' },
  { position: [147, 195], lightness: 60, previewBackground: '#5becad' },
  { position: [81, 84], lightness: 50, previewBackground: '#919bb5' }
]

const LIGHT_ANALOGOUS_SEEDS: readonly PresetSeed[] = [
  {
    position: [240, 240],
    lightness: 90,
    previewBackground: buildAnalogousPreview('#f5edd6', '#ddf3d8', '#f3d8e1')
  },
  {
    position: [233, 157],
    lightness: 85,
    previewBackground: buildAnalogousPreview('#f3bede', '#f7deba', '#dfc3ee')
  },
  {
    position: [236, 111],
    lightness: 80,
    previewBackground: buildAnalogousPreview('#e5b3e4', '#ecacb2', '#c5b9df')
  },
  {
    position: [234, 173],
    lightness: 70,
    previewBackground: buildAnalogousPreview('#eb7a9f', '#efef76', '#d285e0')
  },
  {
    position: [220, 187],
    lightness: 70,
    previewBackground: buildAnalogousPreview('#f2737b', '#aff273', '#e67de8')
  },
  {
    position: [225, 237],
    lightness: 60,
    previewBackground: buildAnalogousPreview('#ddcd55', '#61d45e', '#d75b7c')
  },
  {
    position: [147, 195],
    lightness: 60,
    previewBackground: buildAnalogousPreview('#4be7d2', '#54afde', '#3ef470')
  },
  {
    position: [81, 84],
    lightness: 55,
    previewBackground: buildAnalogousPreview('#7a849e', '#8975a4', '#74a2a4')
  }
]

const DARK_SEEDS: readonly PresetSeed[] = [
  { position: [171, 72], lightness: 10, previewBackground: '#5d566a' },
  { position: [265, 79], lightness: 40, previewBackground: '#997096' },
  { position: [301, 176], lightness: 35, previewBackground: '#956066' },
  { position: [237, 210], lightness: 30, previewBackground: '#9c6645' },
  { position: [91, 228], lightness: 30, previewBackground: '#517b6c' },
  { position: [67, 159], lightness: 25, previewBackground: '#576e75' },
  { position: [314, 235], lightness: 20, previewBackground: '#836d5f' },
  { position: [118, 215], lightness: 20, previewBackground: '#447464' }
]

const DARK_ANALOGOUS_SEEDS: readonly PresetSeed[] = [
  {
    position: [171, 72],
    lightness: 10,
    previewBackground: buildAnalogousPreview('#171122', '#250e23', '#121621')
  },
  {
    position: [265, 79],
    lightness: 40,
    previewBackground: buildAnalogousPreview('#804c7c', '#8d3f42', '#615874')
  },
  {
    position: [301, 176],
    lightness: 35,
    previewBackground: buildAnalogousPreview('#7a3840', '#7e7934', '#6f446e')
  },
  {
    position: [237, 210],
    lightness: 30,
    previewBackground: buildAnalogousPreview('#834116', '#408019', '#7a1f5b')
  },
  {
    position: [91, 228],
    lightness: 30,
    previewBackground: buildAnalogousPreview('#2d6c55', '#345565', '#347623')
  },
  {
    position: [67, 159],
    lightness: 25,
    previewBackground: buildAnalogousPreview('#2d4a53', '#2e3251', '#265a41')
  },
  {
    position: [314, 235],
    lightness: 20,
    previewBackground: buildAnalogousPreview('#402f26', '#374026', '#3b2b34')
  },
  {
    position: [118, 215],
    lightness: 20,
    previewBackground: buildAnalogousPreview('#16503d', '#1a3c4c', '#1b570f')
  }
]

const GRAYSCALE_SEEDS: readonly PresetSeed[] = [
  { position: [340, 180], lightness: 0, previewBackground: '#e0e0e0' },
  { position: [337.5, 180], lightness: 0, previewBackground: '#e0e0e0' },
  { position: [315, 180], lightness: 0, previewBackground: '#c0c0c0' },
  { position: [292.5, 180], lightness: 0, previewBackground: '#a0a0a0' },
  { position: [270, 180], lightness: 0, previewBackground: '#808080' },
  { position: [247.5, 180], lightness: 0, previewBackground: '#606060' },
  { position: [225, 180], lightness: 0, previewBackground: '#404040' },
  { position: [202.5, 180], lightness: 0, previewBackground: '#202020' },
  { position: [180, 180], lightness: 0, previewBackground: '#000000' }
]

function buildAnalogousPreview(first: string, second: string, third: string): string {
  return [
    `radial-gradient(circle at 0% 0%, ${first}, transparent 100%)`,
    `radial-gradient(circle at 100% 0%, ${second}, transparent 100%)`,
    `linear-gradient(to top, ${third} 0%, transparent 60%)`
  ].join(', ')
}

function buildPage(
  pageId: string,
  seeds: readonly PresetSeed[],
  harmony: ThemeGradientHarmony
): ThemeGradientPreset[] {
  return seeds.map((seed, index) => ({
    id: `${pageId}-${index}`,
    x: seed.position[0] / PICKER_SURFACE_SIZE,
    y: seed.position[1] / PICKER_SURFACE_SIZE,
    lightness: seed.lightness,
    mode: 'tint' as const,
    harmony,
    previewBackground: seed.previewBackground
  }))
}

function buildGrayscalePage(): ThemeGradientPreset[] {
  return GRAYSCALE_SEEDS.map((seed, index) => ({
    id: `grayscale-${index}`,
    x: seed.position[0] / PICKER_SURFACE_SIZE,
    y: seed.position[1] / PICKER_SURFACE_SIZE,
    lightness: seed.lightness,
    mode: 'grayscale' as const,
    harmony: 'floating' as const,
    previewBackground: seed.previewBackground
  }))
}

export const THEME_GRADIENT_PRESET_PAGES: readonly (readonly ThemeGradientPreset[])[] = [
  buildPage('light', LIGHT_SEEDS, 'floating'),
  buildPage('light-analogous', LIGHT_ANALOGOUS_SEEDS, 'analogous'),
  buildPage('dark', DARK_SEEDS, 'floating'),
  buildPage('dark-analogous', DARK_ANALOGOUS_SEEDS, 'analogous'),
  buildGrayscalePage()
]

export function themeFromPreset(
  preset: ThemeGradientPreset,
  base: ThemeGradientTheme | null
): ThemeGradientTheme {
  const previous = base ?? createEmptyThemeGradient()
  return {
    ...previous,
    harmony: preset.harmony,
    dots: applyHarmony(
      [{ x: preset.x, y: preset.y, mode: preset.mode, lightness: preset.lightness }],
      preset.harmony
    )
  }
}
