import type { Material } from "../../types";

export type TextureSlot = {
  id: string;
  label: string;
  urlKey: keyof Material;
  nameKey: keyof Material;
  filenameKey: keyof Material;
  flipYKey: keyof Material;
};

export const TEXTURE_SLOTS: Record<string, TextureSlot> = {
  base: {
    id: "base",
    label: "Texture",
    urlKey: "baseColorTextureUrl",
    nameKey: "baseColorTextureName",
    filenameKey: "baseColorTextureFilename",
    flipYKey: "baseColorTextureFlipY",
  },
  normal: {
    id: "normal",
    label: "Normal map",
    urlKey: "normalTextureUrl",
    nameKey: "normalTextureName",
    filenameKey: "normalTextureFilename",
    flipYKey: "normalTextureFlipY",
  },
  bump: {
    id: "bump",
    label: "Bump map",
    urlKey: "bumpTextureUrl",
    nameKey: "bumpTextureName",
    filenameKey: "bumpTextureFilename",
    flipYKey: "bumpTextureFlipY",
  },
  roughness: {
    id: "roughness",
    label: "Roughness map",
    urlKey: "roughnessTextureUrl",
    nameKey: "roughnessTextureName",
    filenameKey: "roughnessTextureFilename",
    flipYKey: "roughnessTextureFlipY",
  },
  metalness: {
    id: "metalness",
    label: "Metalness map",
    urlKey: "metalnessTextureUrl",
    nameKey: "metalnessTextureName",
    filenameKey: "metalnessTextureFilename",
    flipYKey: "metalnessTextureFlipY",
  },
  emissive: {
    id: "emissive",
    label: "Emission map",
    urlKey: "emissiveTextureUrl",
    nameKey: "emissiveTextureName",
    filenameKey: "emissiveTextureFilename",
    flipYKey: "emissiveTextureFlipY",
  },
  alpha: {
    id: "alpha",
    label: "Alpha map",
    urlKey: "alphaTextureUrl",
    nameKey: "alphaTextureName",
    filenameKey: "alphaTextureFilename",
    flipYKey: "alphaTextureFlipY",
  },
  ao: {
    id: "ao",
    label: "AO map",
    urlKey: "aoTextureUrl",
    nameKey: "aoTextureName",
    filenameKey: "aoTextureFilename",
    flipYKey: "aoTextureFlipY",
  },
};
