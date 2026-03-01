export type HarajProduct = {
  id: string
  name: string
  imageUrl: string
  actualPrice: number
  currency: "SAR"
}

export const HARAJ_PRODUCT_BANK: HarajProduct[] = [
  {
    id: "haraj-pro-01",
    name: "سماعة لاسلكية",
    imageUrl: "/images/landing-hero.jpg",
    actualPrice: 349,
    currency: "SAR",
  },
  {
    id: "haraj-pro-02",
    name: "ساعة ذكية",
    imageUrl: "/images/charades-bg.jpg",
    actualPrice: 499,
    currency: "SAR",
  },
  {
    id: "haraj-pro-03",
    name: "كرسي ألعاب",
    imageUrl: "/images/landing.png",
    actualPrice: 899,
    currency: "SAR",
  },
  {
    id: "haraj-pro-04",
    name: "مكنسة روبوت",
    imageUrl: "/images/absolute-tasleek.jpg",
    actualPrice: 1299,
    currency: "SAR",
  },
  {
    id: "haraj-pro-05",
    name: "جوال ذكي",
    imageUrl: "/images/zizo.jpg",
    actualPrice: 2799,
    currency: "SAR",
  },
]
