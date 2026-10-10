import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Bootstrap data — basic baseline 12 tours. Detailed content (description,
// highlights, program, images, etc.) is added by `seed-from-json.ts` from
// the bulk-generated content file.

interface BaseTour {
  slug: string;
  country: string;
  city: string;
  region: string;
  title: string;
  themes: string[];
  durationNights: number;
  hotelStars: number;
  meal: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: "ai" | "hot" | "new";
  emoji: string;
  gradient: string;
  popularity: number;
}

const baseTours: BaseTour[] = [
  { slug: "santorini-7", country: "Greece", city: "Santorini", region: "Europe", title: "White houses and blue domes over the sea", themes: ["water","romantic"], durationNights: 7, hotelStars: 5, meal: "All inclusive", price: 1240, oldPrice: 1460, rating: 4.9, reviews: 312, badge: "ai", emoji: "🏛️", gradient: "linear-gradient(135deg, #BFD9FF 0%, #5B8FF9 100%)", popularity: 92 },
  { slug: "antalya-10", country: "Turkey", city: "Antalya", region: "Europe", title: "10 nights of seaside relaxation", themes: ["water","family"], durationNights: 10, hotelStars: 5, meal: "All inclusive", price: 890, oldPrice: 1190, rating: 4.7, reviews: 1284, badge: "hot", emoji: "🌴", gradient: "linear-gradient(135deg, #FFD0B0 0%, #FF8A4C 100%)", popularity: 98 },
  { slug: "bakuriani-5", country: "Georgia", city: "Bakuriani", region: "Europe", title: "Skiing and mulled wine in the mountains", themes: ["snow","mountains","adventure"], durationNights: 5, hotelStars: 4, meal: "Breakfast", price: 620, rating: 4.8, reviews: 156, emoji: "🎿", gradient: "linear-gradient(135deg, #E0EFFF 0%, #BFD9FF 100%)", popularity: 78 },
  { slug: "kyoto-7", country: "Japan", city: "Kyoto", region: "Asia", title: "Cherry blossoms, temples, tea ceremonies", themes: ["temples","food","cities"], durationNights: 7, hotelStars: 4, meal: "Breakfast", price: 1990, rating: 4.9, reviews: 218, badge: "new", emoji: "🌸", gradient: "linear-gradient(135deg, #FFE0E8 0%, #FFB0C5 100%)", popularity: 84 },
  { slug: "barcelona-5", country: "Spain", city: "Barcelona", region: "Europe", title: "Gaudi, tapas and a beach in the city", themes: ["food","market","cities"], durationNights: 5, hotelStars: 4, meal: "Self-catering", price: 1050, rating: 4.6, reviews: 472, emoji: "🎨", gradient: "linear-gradient(135deg, #FFD0B0 0%, #FFA94D 100%)", popularity: 86 },
  { slug: "bali-9", country: "Indonesia", city: "Bali", region: "Asia", title: "Surfing, rice terraces, spa", themes: ["water","temples","wellness","nature"], durationNights: 9, hotelStars: 5, meal: "Breakfast", price: 1690, rating: 4.8, reviews: 389, emoji: "🏝️", gradient: "linear-gradient(135deg, #B8F0D2 0%, #5BC79A 100%)", popularity: 90 },
  { slug: "maldives-7", country: "Maldives", city: "Male Atoll", region: "Asia", title: "Overwater bungalows · pure relaxation", themes: ["water","romantic","wellness"], durationNights: 7, hotelStars: 5, meal: "All inclusive", price: 2890, rating: 4.9, reviews: 142, badge: "ai", emoji: "🐠", gradient: "linear-gradient(135deg, #BFE7FF 0%, #46B5E0 100%)", popularity: 88 },
  { slug: "iceland-6", country: "Iceland", city: "Reykjavik", region: "Europe", title: "Chasing the northern lights", themes: ["adventure","nature","snow"], durationNights: 6, hotelStars: 4, meal: "Breakfast", price: 1850, rating: 4.7, reviews: 96, badge: "new", emoji: "🌌", gradient: "linear-gradient(135deg, #DCEEFF 0%, #6F86B8 100%)", popularity: 71 },
  { slug: "prague-4", country: "Czechia", city: "Prague", region: "Europe", title: "Gothic spires and craft beer", themes: ["cities","food","family"], durationNights: 4, hotelStars: 4, meal: "Breakfast", price: 540, oldPrice: 690, rating: 4.5, reviews: 612, emoji: "🏰", gradient: "linear-gradient(135deg, #FFE7C2 0%, #D89C4A 100%)", popularity: 80 },
  { slug: "dolomites-7", country: "Italy", city: "Dolomites", region: "Europe", title: "Hiking among sugar-coloured cliffs", themes: ["mountains","adventure","nature"], durationNights: 7, hotelStars: 3, meal: "Half board", price: 980, rating: 4.8, reviews: 174, emoji: "🥾", gradient: "linear-gradient(135deg, #D9E2EF 0%, #93A8C5 100%)", popularity: 73 },
  { slug: "marrakech-5", country: "Morocco", city: "Marrakech", region: "Africa", title: "Souks, riad and dinner in the desert", themes: ["market","food","adventure"], durationNights: 5, hotelStars: 4, meal: "Breakfast", price: 720, rating: 4.6, reviews: 254, emoji: "🐪", gradient: "linear-gradient(135deg, #FFD08A 0%, #E07B3A 100%)", popularity: 76 },
  { slug: "paris-3", country: "France", city: "Paris", region: "Europe", title: "3 days of croissants and the Louvre", themes: ["cities","romantic","food"], durationNights: 3, hotelStars: 4, meal: "Breakfast", price: 690, oldPrice: 820, rating: 4.7, reviews: 1102, badge: "hot", emoji: "🗼", gradient: "linear-gradient(135deg, #FFD3DD 0%, #FF8AA0 100%)", popularity: 95 },
];

/** Generic placeholder content — replaced by detailed JSON-seed later. */
function placeholderContent(t: BaseTour) {
  return {
    shortDescription:
      `${t.durationNights} nights in ${t.city}, ${t.country}. ${t.meal}, ${t.hotelStars}★ hotel.`,
    description:
      `Welcome to ${t.city}. This ${t.durationNights}-night package puts you in a ${t.hotelStars}-star hotel with ${t.meal.toLowerCase()}, transfers, and a curated set of activities. More detailed content coming soon — see highlights and program below for the schedule.`,
    highlights: [
      `${t.durationNights}-night stay in ${t.city}`,
      `${t.hotelStars}★ hotel with ${t.meal.toLowerCase()}`,
      "Curated local activities",
      "24/7 support via WhatsApp",
    ],
    included: [
      "Round-trip flights",
      "Airport transfers",
      `${t.durationNights} nights at ${t.hotelStars}★ hotel`,
      t.meal,
      "Local guided tours",
    ],
    excluded: [
      "Travel insurance (optional add-on)",
      "Personal expenses",
      "Tips for guides and drivers",
    ],
    program: Array.from({ length: Math.min(t.durationNights, 4) }, (_, i) => ({
      day: i + 1,
      title: i === 0 ? "Arrival" : i === 1 ? "Exploration" : i === 2 ? "Day trip" : "Free day & departure",
      text: i === 0
        ? `Arrive in ${t.city}. Hotel check-in. Welcome dinner.`
        : i === 1
          ? `Guided walking tour of ${t.city}'s main sights.`
          : i === 2
            ? "Day trip to a nearby highlight."
            : "Free morning. Hotel check-out. Transfer to airport.",
    })),
  };
}

// Tour operators — mix of registered companies and independent private guides.
const organizers = [
  // -------- Companies --------
  { slug: "aegean-explorers",  name: "Aegean Explorers",  type: "company",
    bio: "Travel agency working in Greece and the Aegean since 2014. Mostly small-group island trips and boat-based itineraries.",
    email: "hello@aegeanexplorers.gr", phone: "+30 22860 71234", whatsapp: "+30 698 1234567", yearsActive: 12 },
  { slug: "riviera-trips",     name: "Riviera Trips",     type: "company",
    bio: "Family-owned agency working in the Mediterranean — Spain, Italy, southern France, Turkey. Beach holidays and short city stays.",
    email: "ciao@riviera-trips.it",   phone: "+39 02 1234567",  whatsapp: "+39 348 1234567", yearsActive: 18 },
  { slug: "asia-connect",      name: "Asia Connect",      type: "company",
    bio: "Bangkok-based operator focused on Japan, Thailand, Indonesia and the Maldives. Mix of beach, culture and wellness trips.",
    email: "team@asiaconnect.travel", phone: "+66 2 123 4567",  whatsapp: "+66 81 234 5678", yearsActive: 9 },
  { slug: "nordic-adventures", name: "Nordic Adventures", type: "company",
    bio: "Iceland and Scandinavia. Northern-lights expeditions, glacier hikes and winter road trips. Run by two locals out of Reykjavik.",
    email: "hi@nordic-adv.no",        phone: "+47 22 123 456",  whatsapp: "+47 98 765 432",  yearsActive: 7 },
  { slug: "city-breaks-eu",    name: "City Breaks EU",    type: "company",
    bio: "European city-break agency — Prague, Paris, Vienna, Berlin and friends. Short trips with flights and hotel arranged, plus a few suggestions for what to do.",
    email: "hello@city-breaks.eu", phone: "+420 222 333 444", whatsapp: "+420 777 888 999", yearsActive: 14 },

  // -------- Private guides --------
  { slug: "olha-marchenko",    name: "Olha Marchenko",    type: "private",
    bio: "Independent guide. Lives in Marrakech for 6 years, originally from Kyiv. Speaks Ukrainian, English, French and Arabic. Takes small groups (up to 6) around the medinas and the Atlas mountains.",
    email: "olha.marrakech@gmail.com", phone: "+212 6 12 34 56 78", whatsapp: "+212 6 12 34 56 78", yearsActive: 6 },
  { slug: "mykola-hrytsenko",  name: "Mykola Hrytsenko",  type: "private",
    bio: "Mountain guide. Former Carpathian Mountain Rescue, certified UIAGM. Runs small ski and hiking trips in the Caucasus, the Alps and the Dolomites. Schedule is flexible — works with what the weather gives.",
    email: "mykola.guide@proton.me", phone: "+380 67 123 4567", whatsapp: "+380 67 123 4567", yearsActive: 11 },
  { slug: "sofia-reyes",       name: "Sofia Reyes",       type: "private",
    bio: "Barcelona-based food and culture guide. Born and raised here. Speaks English, Spanish and Catalan. Shows you the markets, tapas spots and Gaudí details that locals actually like.",
    email: "sofia@bcncuisine.com", phone: "+34 600 123 456", whatsapp: "+34 600 123 456", yearsActive: 4 },

  // -------- Companies — Africa, Middle East, Subcontinent, Latin Am, Pacific --------
  { slug: "safari-africa",     name: "Safari Africa",     type: "company",
    bio: "Nairobi-based operator running small-group and private safaris across Kenya, Tanzania, Botswana, Namibia, Rwanda, Madagascar and South Africa. In business since 2008.",
    email: "info@safariafrica.co.ke", phone: "+254 20 123 4567", whatsapp: "+254 712 345 678", yearsActive: 17 },
  { slug: "nile-voyages",      name: "Nile Voyages",      type: "company",
    bio: "Cairo-based agency for Egypt, Jordan, Israel, Turkey, UAE and Oman. Specialists in dahabiya cruises on the Nile and small-group desert trips.",
    email: "hello@nile-voyages.eg", phone: "+20 2 1234 5678", whatsapp: "+20 100 123 4567", yearsActive: 10 },
  { slug: "subcontinent-trails", name: "Subcontinent Trails", type: "company",
    bio: "Delhi-based operator running carefully paced trips through India, Sri Lanka, Nepal and Bhutan. Heritage palace stays, hill-country trains and Himalayan teahouse treks.",
    email: "team@subcontinent-trails.in", phone: "+91 11 4321 0000", whatsapp: "+91 98 1234 5678", yearsActive: 13 },
  { slug: "latin-explore",     name: "Latin Explore",     type: "company",
    bio: "Lima-based agency for Peru, Chile, Argentina, Brazil, Colombia, Ecuador, Mexico, Cuba and Costa Rica. Mix of city stays, Andean treks and Amazon/Galápagos add-ons.",
    email: "hola@latin-explore.pe", phone: "+51 1 234 5678", whatsapp: "+51 998 765 432", yearsActive: 11 },
  { slug: "pacific-shores",    name: "Pacific Shores",    type: "company",
    bio: "Auckland-based operator covering New Zealand, Australia, Fiji, French Polynesia and the western US/Canada national parks. Self-drive and small-group itineraries.",
    email: "kia.ora@pacific-shores.nz", phone: "+64 9 123 4567", whatsapp: "+64 21 234 567", yearsActive: 9 },

  // -------- Private guides --------
  { slug: "liang-tanaka",      name: "Liang Tanaka",      type: "private",
    bio: "Kyoto-based culture and food guide. Half-Japanese half-Taiwanese, raised in Tokyo, lives in Higashiyama. Speaks English, Japanese, Mandarin. Specialises in tea ceremony, kaiseki, ryokan stays and the parts of Tokyo that aren't in the guidebooks.",
    email: "liang.kyoto@proton.me", phone: "+81 70 1234 5678", whatsapp: "+81 70 1234 5678", yearsActive: 8 },
];

const slugToOrganizer: Record<string, string> = {
  "santorini-7":  "aegean-explorers",
  "antalya-10":   "riviera-trips",
  "bakuriani-5":  "mykola-hrytsenko",     // private guide
  "kyoto-7":      "asia-connect",
  "barcelona-5":  "sofia-reyes",           // private guide
  "bali-9":       "asia-connect",
  "maldives-7":   "asia-connect",
  "iceland-6":    "nordic-adventures",
  "prague-4":     "city-breaks-eu",
  "dolomites-7":  "mykola-hrytsenko",     // private guide
  "marrakech-5":  "olha-marchenko",       // private guide
  "paris-3":      "city-breaks-eu",
};

async function main() {
  // Safety guard — this script DROPS everything before re-seeding. Running it
  // on a live deploy by accident (or via a misconfigured build hook) would
  // wipe real user bookings + reviews. Refuse to run unless explicitly told
  // it's OK. For initial bootstrap on a fresh deploy:
  //   SEED_ALLOW_WIPE=1 npm run db:seed
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_WIPE !== "1") {
    console.error("✗ seed.ts refuses to run in production without SEED_ALLOW_WIPE=1");
    console.error("  This script deletes ALL bookings/users/tours before re-seeding.");
    console.error("  If this is the initial bootstrap, re-run with: SEED_ALLOW_WIPE=1 npm run db:seed");
    process.exit(1);
  }

  console.log("→ wiping existing data");
  await prisma.aiQuery.deleteMany();
  await prisma.savedTour.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.tour.deleteMany();
  await prisma.organizer.deleteMany();
  await prisma.user.deleteMany();

  console.log(`→ seeding ${organizers.length} tour operators`);
  const orgIdBySlug: Record<string, number> = {};
  for (const o of organizers) {
    const row = await prisma.organizer.create({ data: o });
    orgIdBySlug[o.slug] = row.id;
  }

  console.log("→ seeding base 12 tours with placeholder content");
  for (const t of baseTours) {
    const p = placeholderContent(t);
    const orgSlug = slugToOrganizer[t.slug];
    await prisma.tour.create({
      data: {
        slug: t.slug,
        country: t.country,
        city: t.city,
        region: t.region,
        title: t.title,
        shortDescription: p.shortDescription,
        description: p.description,
        highlights: JSON.stringify(p.highlights),
        included:   JSON.stringify(p.included),
        excluded:   JSON.stringify(p.excluded),
        program:    JSON.stringify(p.program),
        themes:     JSON.stringify(t.themes),
        durationNights: t.durationNights,
        hotelStars: t.hotelStars,
        meal: t.meal,
        price: t.price,
        oldPrice: t.oldPrice ?? null,
        rating: t.rating,
        reviewsCount: t.reviews,
        badge: t.badge ?? null,
        emoji: t.emoji,
        gradient: t.gradient,
        imageCount: 0,
        popularity: t.popularity,
        organizerId: orgSlug ? orgIdBySlug[orgSlug] : null,
      },
    });
  }

  console.log("→ creating demo user (danylo@example.com / password)");
  const passwordHash = await bcrypt.hash("password", 10);
  const demo = await prisma.user.create({
    data: {
      email: "danylo@example.com",
      name: "Danylo Kiriienko",
      passwordHash,
      budgetFrom: 800,
      budgetTo: 1500,
      favThemes: JSON.stringify(["water", "temples"]),
      travelFreq: "few-per-year",
      companion: "partner",
      citizenship: "UA",
    },
  });

  console.log("→ seeding bookings (1 upcoming + 1 past with review) for demo user");
  const santorini = await prisma.tour.findUnique({ where: { slug: "santorini-7" } });
  const antalya = await prisma.tour.findUnique({ where: { slug: "antalya-10" } });
  const prague   = await prisma.tour.findUnique({ where: { slug: "prague-4" } });
  if (santorini && antalya && prague) {
    // Upcoming
    const inSixWeeks = new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000);
    await prisma.booking.create({
      data: {
        userId: demo.id,
        tourId: santorini.id,
        travelers: JSON.stringify([
          { firstName: "Danylo", lastName: "Kiriienko", dob: "2004-05-12", passport: "FK123456" },
          { firstName: "Anna",   lastName: "Kiriienko", dob: "2003-07-20", passport: "FK654321" },
        ]),
        contact: JSON.stringify({ email: "danylo@example.com", phone: "+380953526635" }),
        addOns: JSON.stringify(["insurance"]),
        totalPrice: santorini.price * 2 + 45,
        status: "confirmed",
        startDate: inSixWeeks,
      },
    });

    // Past with a review
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const antalyaBooking = await prisma.booking.create({
      data: {
        userId: demo.id,
        tourId: antalya.id,
        travelers: JSON.stringify([
          { firstName: "Danylo", lastName: "Kiriienko", dob: "2004-05-12", passport: "FK123456" },
        ]),
        contact: JSON.stringify({ email: "danylo@example.com", phone: "+380953526635" }),
        addOns: JSON.stringify([]),
        totalPrice: antalya.price,
        status: "completed",
        startDate: twoMonthsAgo,
      },
    });
    await prisma.review.create({
      data: {
        userId: demo.id,
        tourId: antalya.id,
        bookingId: antalyaBooking.id,
        rating: 5,
        title: "Genuinely better than expected",
        body: "The hotel was great, food was endless, beach was clean. Antalya in late September is the perfect call — no peak-season heat, no crowds. Recommended.",
        photos: JSON.stringify([]),
      },
    });

    // Past without a review (so demo user can leave one in the UI)
    const fiveMonthsAgo = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);
    await prisma.booking.create({
      data: {
        userId: demo.id,
        tourId: prague.id,
        travelers: JSON.stringify([
          { firstName: "Danylo", lastName: "Kiriienko", dob: "2004-05-12", passport: "FK123456" },
        ]),
        contact: JSON.stringify({ email: "danylo@example.com", phone: "+380953526635" }),
        addOns: JSON.stringify([]),
        totalPrice: prague.price,
        status: "completed",
        startDate: fiveMonthsAgo,
      },
    });

    console.log("→ seeding extra reviews so each operator has data");
    const u1 = await prisma.user.create({
      data: { email: "olena@example.com", name: "Olena S.", passwordHash, citizenship: "UA" },
    });
    const u2 = await prisma.user.create({
      data: { email: "marko@example.com", name: "Marko P.", passwordHash, citizenship: "UA" },
    });
    const u3 = await prisma.user.create({
      data: { email: "iryna@example.com", name: "Iryna L.", passwordHash, citizenship: "UA" },
    });
    const u4 = await prisma.user.create({
      data: { email: "andriy@example.com", name: "Andriy R.", passwordHash, citizenship: "UA" },
    });

    /** Helper — create a past completed booking with a review in one shot. */
    async function pastReview(userId: number, tourSlug: string, rating: number, title: string, body: string, daysAgo = 90) {
      const tour = await prisma.tour.findUnique({ where: { slug: tourSlug } });
      if (!tour) return;
      const booking = await prisma.booking.create({
        data: {
          userId, tourId: tour.id, totalPrice: tour.price,
          travelers: JSON.stringify([{ firstName: "—", lastName: "—" }]),
          contact: JSON.stringify({ email: "—", phone: "—" }),
          addOns: JSON.stringify([]),
          status: "completed",
          startDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.review.create({
        data: {
          userId, tourId: tour.id, bookingId: booking.id,
          rating, title, body, photos: JSON.stringify([]),
        },
      });
    }

    // Santorini (Aegean Explorers — company)
    await pastReview(u1.id, "santorini-7", 5, "Worth every euro",
      "Honeymoon trip — the sunset cruise was the highlight. Hotel staff knew it was special, they put rose petals in the room without us asking. Don't skip the wine tour.", 100);
    await pastReview(u2.id, "santorini-7", 4, "Beautiful but crowded",
      "Santorini is gorgeous but pick low season if you can. End of May was already busy. Hotel was perfect, food was great, but Oia at sunset is shoulder-to-shoulder tourists.", 200);

    // Bakuriani (Mykola — private)
    await pastReview(u1.id, "bakuriani-5", 5, "Real mountain guide makes all the difference",
      "Mykola knows every slope. We're intermediate skiers and he picked routes that pushed us just enough. Great little family hotel too, the wine in the evenings was endless.", 130);
    await pastReview(u3.id, "bakuriani-5", 4, "Solid winter break",
      "5 nights flew by. Lifts had a bit of a queue on Saturday but Mykola swapped our schedule on the fly. Would book again.", 220);

    // Dolomites (Mykola — private)
    await pastReview(u4.id, "dolomites-7", 5, "Best hiking week of my life",
      "Trails I'd never have found on my own. Mykola adapted day 3 because of weather without making it feel like a problem. Mountain huts were charming, food was excellent.", 80);

    // Marrakech (Olha — private)
    await pastReview(u3.id, "marrakech-5", 5, "Olha is the real deal",
      "She speaks Arabic well enough that shopkeepers stop treating you like a tourist. The desert dinner was magical. Riad was beautiful, breakfasts on the rooftop were perfect.", 60);
    await pastReview(u2.id, "marrakech-5", 5, "Felt safe and seen the whole trip",
      "First time in North Africa and Olha made it feel completely natural. She knew exactly when to push us into the souks and when to leave us alone.", 170);

    // Barcelona (Sofia — private)
    await pastReview(u4.id, "barcelona-5", 5, "Food walk was the highlight",
      "Sofia took us to four tapas spots no guidebook mentions. Vermut on a sunny rooftop, anchovies that ruined supermarket ones forever. Would book her again next year.", 50);
    await pastReview(u1.id, "barcelona-5", 4, "Great guide, OK hotel",
      "Sofia was fantastic. Hotel was a slightly tired 4★, but for the price it's fine. The walking tours made up for it.", 140);

    // Prague (City Breaks EU — company)
    await pastReview(u2.id, "prague-4", 5, "Perfect long weekend",
      "Hotel right on the square, walked everywhere. The pre-booked brewery tour was unexpectedly fun. 4 nights is the right length — anything more would be overkill.", 90);
    await pastReview(u3.id, "prague-4", 4, "Excellent value",
      "€540 felt like a steal. Flights at decent times, hotel was modern, the included walking tour was actually good. The only miss was the included dinner — skip it next time.", 200);

    // Paris (City Breaks EU — company)
    await pastReview(u4.id, "paris-3", 5, "Quick romantic trip done right",
      "3 days and a perfect plan. Hotel near Saint-Germain. They threw in priority Louvre tickets which saved us an hour of queueing. Highly recommended.", 70);

    // Iceland (Nordic Adventures — company)
    await pastReview(u1.id, "iceland-6", 5, "Saw the lights on night 2",
      "Worth booking the optional aurora forecast SMS — woke us up at 1am, we drove 20 minutes, and there it was. Hotel was simple but Iceland prices, so fair.", 110);
    await pastReview(u2.id, "iceland-6", 4, "Cold but unforgettable",
      "Plan for the weather. Lupin season was insane. Glacier hike on day 4 was a bit pricey but I'd do it again.", 240);

    // Kyoto (Asia Connect — company)
    await pastReview(u3.id, "kyoto-7", 5, "Cherry blossom was peak",
      "Booked late and got upgraded to a ryokan with a private onsen. Tea ceremony, temple at dawn, sushi at the counter. Pricey but worth every yen.", 35);

    // Bali (Asia Connect — company)
    await pastReview(u4.id, "bali-9", 5, "Slow, peaceful, restorative",
      "9 nights of yoga, rice fields, scooter rides. Spa twice. Came back a different person. Hotel staff were the warmest I've ever met.", 180);

    // Maldives (Asia Connect — company)
    await pastReview(u1.id, "maldives-7", 5, "Anniversary trip — flawless",
      "Overwater bungalow really is as good as the photos. Snorkelling 10m from your door. Yes it's expensive, no, we don't regret it.", 45);

    // Antalya (Riviera Trips — company) — note: already has Danylo's past review above

    console.log("→ saving 3 tours to demo user's wishlist");
    for (const slug of ["bakuriani-5", "kyoto-7", "bali-9"]) {
      const t = await prisma.tour.findUnique({ where: { slug } });
      if (t) await prisma.savedTour.create({ data: { userId: demo.id, tourId: t.id } });
    }
  }

  console.log("\n✓ done. demo user: danylo@example.com / password");
  console.log("  Run `npm run db:seed:json -- ./data/tours.json` to enrich with full content.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
