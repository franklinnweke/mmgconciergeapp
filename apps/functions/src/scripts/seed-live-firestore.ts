import fs from 'node:fs';
import os from 'node:os';

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(obj: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
}

const SEED_OWNERS = [
  {
    ownerId: 'owner-adeleke-01',
    legalName: 'Babatunde Adeleke',
    phone: '+2348031234567',
    email: 'babatunde.adeleke@mmgfleet.ng',
    areaLabel: 'Ikoyi, Lagos',
    verificationStatus: 'verified',
    termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
  },
  {
    ownerId: 'owner-okafor-02',
    legalName: 'Chiamaka Okafor',
    phone: '+2348029876543',
    email: 'chiamaka.okafor@mmgfleet.ng',
    areaLabel: 'Victoria Island, Lagos',
    verificationStatus: 'verified',
    termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
  },
  {
    ownerId: 'owner-fashola-03',
    legalName: 'Tunde Fashola',
    phone: '+2348055551212',
    email: 'tunde.fashola@mmgfleet.ng',
    areaLabel: 'Banana Island, Lagos',
    verificationStatus: 'verified',
    termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
  },
  {
    ownerId: 'owner-nnamdi-04',
    legalName: 'Dr. Emeka Nnamdi',
    phone: '+2348077778899',
    email: 'emeka.nnamdi@mmgfleet.ng',
    areaLabel: 'Victoria Island, Lagos',
    verificationStatus: 'verified',
    termsAcceptedAt: new Date('2026-08-01T10:00:00Z'),
  },
];

const SEED_FLEET = [
  {
    vehicleId: 'veh-lagos-prado-250-first-edition',
    ownerId: 'owner-adeleke-01',
    displayName: 'Toyota Land Cruiser Prado 250 First Edition',
    make: 'Toyota',
    model: 'Land Cruiser Prado 250',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    ownerDailyRateKobo: 38500000,
    areaLabel: 'Ikoyi, Lagos',
    approxLatitude: 6.4520,
    approxLongitude: 3.4350,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/prado-250-obsidian-hero.png',
    imageUrls: ['/assets/images/fleet/prado-250-obsidian-hero.png'],
    description: '2024 Toyota Land Cruiser Prado 250 First Edition in Obsidian Black. Equipped with high-clearance executive suspension, dual-zone climate control, privacy glass, and certified executive chauffeur.',
    features: ['Dual Climate A/C', 'Security Chauffeur', 'Leather Captain Chairs', 'Airport Tarmac Delivery', '4WD Terrain Command', 'Tinted Executive Privacy'],
    plateNumber: 'LAG-250-AB',
    plateMasked: 'LAG-***-AB',
    vin: 'JTEBU5JR8R5019284',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
  },
  {
    vehicleId: 'veh-lagos-prado-150-vx-pearl',
    ownerId: 'owner-okafor-02',
    displayName: 'Toyota Land Cruiser Prado 150 VX Luxury',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 VX',
    year: 2023,
    category: 'executive_suv',
    seats: 7,
    ownerDailyRateKobo: 29000000,
    areaLabel: 'Victoria Island, Lagos',
    approxLatitude: 6.4281,
    approxLongitude: 3.4219,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/prado-150-pearl.png',
    imageUrls: ['/assets/images/fleet/prado-150-pearl.png'],
    description: '2023 Toyota Land Cruiser Prado 150 VX in Pearl White metallic. High-grade executive interior, whisper-quiet cabin, cool-box refrigeration, and professional diplomatic driver.',
    features: ['Cool Box Refrigeration', 'Executive Chauffeur', 'JBL Premium Audio', 'Full Leather Seating', 'VI / Island Express Delivery'],
    plateNumber: 'KJA-150-XY',
    plateMasked: 'KJA-***-XY',
    vin: 'JTEBX3FJ5P5082193',
    transmission: 'Automatic',
    colour: 'Pearl White',
  },
  {
    vehicleId: 'veh-lagos-prado-150-txl-graphite',
    ownerId: 'owner-adeleke-01',
    displayName: 'Toyota Land Cruiser Prado 150 TXL',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 TXL',
    year: 2022,
    category: 'executive_suv',
    seats: 7,
    ownerDailyRateKobo: 25000000,
    areaLabel: 'Lekki Phase 1, Lagos',
    approxLatitude: 6.4474,
    approxLongitude: 3.4731,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/prado-150-graphite.png',
    imageUrls: ['/assets/images/fleet/prado-150-graphite.png'],
    description: '2022 Toyota Land Cruiser Prado 150 TXL in Metallic Graphite Grey. Robust Lagos-road resilience, rear passenger comfort, and certified security-vetted driver.',
    features: ['Security Vetted Driver', 'Heavy-Duty Suspension', 'Dual A/C System', 'Fast Dispatch Lekki Corridor', 'Spacious Cargo Space'],
    plateNumber: 'APP-150-GR',
    plateMasked: 'APP-***-GR',
    vin: 'JTEBX3FJ2N5041920',
    transmission: 'Automatic',
    colour: 'Graphite Grey',
  },
  {
    vehicleId: 'veh-lagos-lc300-vxr-vip',
    ownerId: 'owner-fashola-03',
    displayName: 'Toyota Land Cruiser 300 VXR VIP',
    make: 'Toyota',
    model: 'Land Cruiser 300 VXR',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    ownerDailyRateKobo: 55000000,
    areaLabel: 'Banana Island, Ikoyi, Lagos',
    approxLatitude: 6.4600,
    approxLongitude: 3.4480,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/lc300-vxr-white.png',
    imageUrls: ['/assets/images/fleet/lc300-vxr-white.png'],
    description: '2024 Toyota Land Cruiser 300 VXR VIP Flagship in Super White. Twin-turbo V6, ventilated executive leather, heads-up display, and VIP protocol chauffeur.',
    features: ['Twin-Turbo V6 Power', 'VIP Protocol Chauffeur', 'Ventilated Climate Seats', 'Rear Seat Entertainment', 'Armored Door Panels'],
    plateNumber: 'BDG-300-LC',
    plateMasked: 'BDG-***-LC',
    vin: 'JTMAB09J9R4011283',
    transmission: 'Automatic',
    colour: 'Super White',
  },
  {
    vehicleId: 'veh-lagos-mercedes-s580-saloon',
    ownerId: 'owner-nnamdi-04',
    displayName: 'Mercedes-Benz S 580 4MATIC Executive Saloon',
    make: 'Mercedes-Benz',
    model: 'S 580 4MATIC',
    year: 2023,
    category: 'executive_sedan',
    seats: 4,
    ownerDailyRateKobo: 48000000,
    areaLabel: 'Victoria Island, Lagos',
    approxLatitude: 6.4310,
    approxLongitude: 3.4150,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/mercedes-s580-black.png',
    imageUrls: ['/assets/images/fleet/mercedes-s580-black.png'],
    description: '2023 Mercedes-Benz S 580 long-wheelbase in Obsidian Black. Rear executive reclining lounge with calf rests, Burmester 3D surround sound, and uniformed executive chauffeur.',
    features: ['Rear Executive Lounge', 'Burmester 3D Audio', 'Massage Seats', 'Panoramic Sunroof', 'Chauffeured VIP Protocol'],
    plateNumber: 'JJJ-580-MB',
    plateMasked: 'JJJ-***-MB',
    vin: 'W1K2231761A094821',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
  },
  {
    vehicleId: 'veh-lagos-mercedes-vclass-jet',
    ownerId: 'owner-fashola-03',
    displayName: 'Mercedes-Benz V-Class VIP Jet Edition',
    make: 'Mercedes-Benz',
    model: 'V-Class Extra Long',
    year: 2023,
    category: 'luxury_van',
    seats: 6,
    ownerDailyRateKobo: 42000000,
    areaLabel: 'Murtala Muhammed Airport, Lagos',
    approxLatitude: 6.5774,
    approxLongitude: 3.3212,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/mercedes-vclass-vip.png',
    imageUrls: ['/assets/images/fleet/mercedes-vclass-vip.png'],
    description: '2023 Mercedes-Benz V-Class VIP Jet Lounge in Obsidian Black. 4 facing first-class electric captain chairs, privacy partition, Wi-Fi router, and direct tarmac VIP pickup.',
    features: ['First-Class Captain Chairs', 'Airport VIP Tarmac Access', 'Privacy Glass Partition', 'On-board Wi-Fi & Fridge', 'Starlight Headliner'],
    plateNumber: 'IKJ-447-VC',
    plateMasked: 'IKJ-***-VC',
    vin: 'WDF44781513982104',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
  },
  {
    vehicleId: 'veh-lagos-mercedes-g63-amg',
    ownerId: 'owner-adeleke-01',
    displayName: 'Mercedes-AMG G 63 Executive Escort',
    make: 'Mercedes-AMG',
    model: 'G 63',
    year: 2023,
    category: 'executive_suv',
    seats: 5,
    ownerDailyRateKobo: 65000000,
    areaLabel: 'Ikoyi, Lagos',
    approxLatitude: 6.4500,
    approxLongitude: 3.4300,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/mercedes-g63-black.png',
    imageUrls: ['/assets/images/fleet/mercedes-g63-black.png'],
    description: '2023 Mercedes-AMG G 63 in Obsidian Black with Night Package. Handcrafted 4.0L V8 Biturbo, unmistakable executive road authority, and defensive-driving trained security escort driver.',
    features: ['Handcrafted AMG V8', 'Defensive Escort Driver', 'Night Package Trim', 'Active Multicontour Seats', 'Ikoyi & Island Rapid Delivery'],
    plateNumber: 'IKY-63-AMG',
    plateMasked: 'IKY-***-63',
    vin: 'W1N4632761X391048',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
  },
  {
    vehicleId: 'veh-lagos-lexus-lx600-vip',
    ownerId: 'owner-okafor-02',
    displayName: 'Lexus LX 600 Ultra Luxury Lounge',
    make: 'Lexus',
    model: 'LX 600 Ultra Luxury',
    year: 2024,
    category: 'executive_suv',
    seats: 4,
    ownerDailyRateKobo: 58000000,
    areaLabel: 'Eko Atlantic, Lagos',
    approxLatitude: 6.4150,
    approxLongitude: 3.4100,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
    discoverable: true,
    moderationStatus: 'approved',
    visibility: 'active',
    primaryImageUrl: '/assets/images/fleet/lexus-lx600-pearl.png',
    imageUrls: ['/assets/images/fleet/lexus-lx600-pearl.png'],
    description: '2024 Lexus LX 600 Ultra Luxury in Eminent White Pearl. 4-seat VIP executive layout with Ottoman footrest, Mark Levinson 25-speaker audio, and white-glove chauffeur service.',
    features: ['4-Seat VIP Ottoman Lounge', 'Mark Levinson 25-Speaker', 'Active Height Control', 'Eko Atlantic & VI Delivery', 'Executive Chauffeur Included'],
    plateNumber: 'EKO-600-LX',
    plateMasked: 'EKO-***-LX',
    vin: 'JTJHY7AX8R4092184',
    transmission: 'Automatic',
    colour: 'Eminent White Pearl',
  },
];

async function seed() {
  console.log('🚀 Loading Firebase Auth Token from CLI...');
  const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
  const token = cfg.tokens?.access_token;
  if (!token) {
    throw new Error('No access_token found in firebase-tools config');
  }

  const BASE_URL = 'https://firestore.googleapis.com/v1/projects/mmg-concierge/databases/(default)/documents';

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  console.log(`Writing ${SEED_OWNERS.length} verified owners to Firestore...`);
  for (const owner of SEED_OWNERS) {
    // 1. ownerProfiles
    const ownerBody = toFirestoreDocument({
      ownerId: owner.ownerId,
      legalName: owner.legalName,
      phone: owner.phone,
      email: owner.email,
      areaLabel: owner.areaLabel,
      verificationStatus: owner.verificationStatus,
      termsAcceptedAt: owner.termsAcceptedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const resProfile = await fetch(`${BASE_URL}/ownerProfiles/${owner.ownerId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(ownerBody),
    });
    if (!resProfile.ok) {
      console.warn(`Warning writing ownerProfile ${owner.ownerId}:`, resProfile.status, await resProfile.text());
    }

    // 2. users
    const userBody = toFirestoreDocument({
      uid: owner.ownerId,
      accountType: 'owner',
      displayName: owner.legalName,
      email: owner.email,
      phoneNumber: owner.phone,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await fetch(`${BASE_URL}/users/${owner.ownerId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(userBody),
    });
  }

  console.log(`Writing ${SEED_FLEET.length} approved executive vehicles to Firestore...`);
  for (const v of SEED_FLEET) {
    // 1. Public discoverable vehicle
    const vehicleDoc = toFirestoreDocument({
      vehicleId: v.vehicleId,
      ownerId: v.ownerId,
      displayName: v.displayName,
      make: v.make,
      model: v.model,
      year: v.year,
      category: v.category,
      seats: v.seats,
      ownerDailyRateKobo: v.ownerDailyRateKobo,
      areaLabel: v.areaLabel,
      approxLatitude: v.approxLatitude,
      approxLongitude: v.approxLongitude,
      chauffeurPolicy: v.chauffeurPolicy,
      deliveryPolicy: v.deliveryPolicy,
      discoverable: v.discoverable,
      moderationStatus: v.moderationStatus,
      visibility: v.visibility,
      primaryImageUrl: v.primaryImageUrl,
      imageUrls: v.imageUrls,
      description: v.description,
      features: v.features,
      transmission: v.transmission,
      colour: v.colour,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resVeh = await fetch(`${BASE_URL}/vehicles/${v.vehicleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(vehicleDoc),
    });
    if (!resVeh.ok) {
      console.warn(`Warning writing vehicle ${v.vehicleId}:`, resVeh.status, await resVeh.text());
    } else {
      console.log(`✔ [vehicles/${v.vehicleId}] ${v.displayName} (${v.areaLabel})`);
    }

    // 2. Private details
    const privateDoc = toFirestoreDocument({
      vehicleId: v.vehicleId,
      ownerId: v.ownerId,
      plateNumber: v.plateNumber,
      plateMasked: v.plateMasked,
      vin: v.vin,
      state: 'Lagos',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await fetch(`${BASE_URL}/vehiclePrivate/${v.vehicleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(privateDoc),
    });

    // 3. Sentinel
    const sentinelDoc = toFirestoreDocument({
      vehicleId: v.vehicleId,
      updatedAt: new Date(),
    });
    await fetch(`${BASE_URL}/vehicleAvailabilitySentinels/${v.vehicleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(sentinelDoc),
    });
  }

  console.log('🎉 Live Firestore database is fully populated with Prado-first and executive fleet!');
}

seed().catch(console.error);
