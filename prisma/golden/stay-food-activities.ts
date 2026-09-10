/**
 * G05 - Stay + Food + Activities. Small, deliberately deep (not wide) golden
 * fixture: exactly one Accommodation/Cuisine/Dish/Restaurant/Attraction/
 * Activity per country, reusing only already-seeded Country/Region/City/
 * Destination rows (no new geography). Every provider-backed row (offers,
 * operational snapshot) is seeded against a single, unmistakably
 * non-production fixture provider (`TEST_PROVIDER_G05_FIXTURE` - see
 * `docs/backend/G05_STAY_FOOD_ACTIVITIES.md` "Fixture Provider") that is
 * gated through the exact same G02 `ProviderRegistryService.
 * getExecutionContext()` path any real adapter would have to pass, never a
 * bypass. Distinct from G02's own `TEST_PROVIDER_G02_FIXTURE` (that one
 * stays e2e-test-only per `docs/backend/PROVIDER_LICENSING.md` section 11 -
 * this is a separate, G05-scoped fixture explicitly seeded into the Golden
 * Dataset per this phase's own brief, "Golden Provider Fixture" section).
 * No historical/origin claim about any Dish is made - summaries are
 * original, non-substantive descriptive text only (spec section 32).
 */

export const STAY_FOOD_ACTIVITY_FIXTURE_PROVIDER_CODE = 'TEST_PROVIDER_G05_FIXTURE';

export interface CountryFixtureSpec {
  countryKey: string;
  regionKey: string;
  cityKey: string;
  destinationKey: string;
  accommodation: {
    key: string;
    type: string;
    vi: { name: string; summary: string };
    en: { name: string; summary: string };
  };
  cuisine: { key: string; vi: { name: string; summary: string }; en: { name: string; summary: string } };
  dishes: { key: string; vi: { name: string; summary: string }; en: { name: string; summary: string } }[];
  restaurant: { key: string; vi: { name: string; summary: string }; en: { name: string; summary: string } };
  attraction: { key: string; vi: { name: string; summary: string }; en: { name: string; summary: string } };
  activity: { key: string; vi: { name: string; summary: string }; en: { name: string; summary: string } };
}

export const GOLDEN_STAY_FOOD_ACTIVITIES: CountryFixtureSpec[] = [
  {
    countryKey: 'COUNTRY_VN',
    regionKey: 'REGION_HA_NOI',
    cityKey: 'CITY_HA_NOI',
    destinationKey: 'DESTINATION_HANOI_OLD_QUARTER',
    accommodation: {
      key: 'ACCOMMODATION_HANOI_OLD_QUARTER_HOTEL',
      type: 'HOTEL',
      vi: { name: 'Khách sạn Phố Cổ Hà Nội', summary: 'Khách sạn nhỏ giữa lòng 36 phố phường.' },
      en: { name: 'Hanoi Old Quarter Hotel', summary: 'A small hotel in the heart of the 36 Streets.' },
    },
    cuisine: {
      key: 'CUISINE_HANOI',
      vi: { name: 'Ẩm thực Hà Nội', summary: 'Truyền thống ẩm thực đường phố của Hà Nội.' },
      en: { name: 'Hanoi cuisine', summary: "Hanoi's street-food culinary tradition." },
    },
    dishes: [
      { key: 'DISH_PHO', vi: { name: 'Phở', summary: 'Món súp bún gạo truyền thống của Việt Nam.' }, en: { name: 'Phở', summary: "Vietnam's traditional rice-noodle soup." } },
      { key: 'DISH_BUN_CHA', vi: { name: 'Bún chả', summary: 'Bún ăn kèm chả nướng, đặc sản Hà Nội.' }, en: { name: 'Bún chả', summary: 'Grilled pork with rice noodles, a Hanoi specialty.' } },
    ],
    restaurant: {
      key: 'RESTAURANT_HANOI_OLD_QUARTER',
      vi: { name: 'Quán ăn Phố Cổ', summary: 'Quán ăn gia đình phục vụ món Hà Nội truyền thống.' },
      en: { name: 'Old Quarter Eatery', summary: 'A family-run restaurant serving traditional Hanoi dishes.' },
    },
    attraction: {
      key: 'ATTRACTION_HANOI_OLD_QUARTER_WALK',
      vi: { name: 'Khu phố cổ Hà Nội (điểm tham quan)', summary: 'Khu phố lịch sử với kiến trúc ống đặc trưng.' },
      en: { name: 'Hanoi Old Quarter (visitor site)', summary: 'A historic quarter known for its narrow tube-house architecture.' },
    },
    activity: {
      key: 'ACTIVITY_HANOI_FOOD_TOUR',
      vi: { name: 'Tour ẩm thực phố cổ Hà Nội', summary: 'Tour đi bộ khám phá ẩm thực đường phố Hà Nội.' },
      en: { name: 'Hanoi Old Quarter food walking tour', summary: "A walking tour of Hanoi's street food." },
    },
  },
  {
    countryKey: 'COUNTRY_JP',
    regionKey: 'REGION_KYOTO_PREF',
    cityKey: 'CITY_KYOTO',
    destinationKey: 'DESTINATION_GION',
    accommodation: {
      key: 'ACCOMMODATION_GION_RYOKAN',
      type: 'RYOKAN',
      vi: { name: 'Ryokan Gion', summary: 'Nhà trọ truyền thống Nhật Bản tại khu phố Gion.' },
      en: { name: 'Gion Ryokan', summary: 'A traditional Japanese inn in the Gion district.' },
    },
    cuisine: {
      key: 'CUISINE_KYOTO',
      vi: { name: 'Ẩm thực Kyoto', summary: 'Truyền thống ẩm thực tinh tế của cố đô Kyoto.' },
      en: { name: 'Kyoto cuisine', summary: "The refined culinary tradition of Japan's old capital." },
    },
    dishes: [
      { key: 'DISH_KAISEKI', vi: { name: 'Kaiseki', summary: 'Bữa ăn nhiều món theo nghi thức truyền thống Nhật Bản.' }, en: { name: 'Kaiseki', summary: 'A traditional multi-course Japanese haute cuisine meal.' } },
      { key: 'DISH_YUDOFU', vi: { name: 'Yudofu', summary: 'Đậu phụ luộc, món chay truyền thống của Kyoto.' }, en: { name: 'Yudofu', summary: "Simmered tofu, a traditional Kyoto vegetarian dish." } },
    ],
    restaurant: {
      key: 'RESTAURANT_GION',
      vi: { name: 'Nhà hàng Gion', summary: 'Nhà hàng phục vụ ẩm thực Kyoto truyền thống tại Gion.' },
      en: { name: 'Gion Restaurant', summary: 'A restaurant serving traditional Kyoto cuisine in Gion.' },
    },
    attraction: {
      key: 'ATTRACTION_GION_DISTRICT',
      vi: { name: 'Khu phố Gion (điểm tham quan)', summary: 'Khu phố geisha lịch sử của Kyoto.' },
      en: { name: 'Gion District (visitor site)', summary: "Kyoto's historic geisha district." },
    },
    activity: {
      key: 'ACTIVITY_GION_EVENING_WALK',
      vi: { name: 'Tour đi bộ buổi tối Gion', summary: 'Tour đi bộ khám phá khu phố Gion vào buổi tối.' },
      en: { name: 'Gion evening walking tour', summary: 'An evening walking tour of the Gion district.' },
    },
  },
];
