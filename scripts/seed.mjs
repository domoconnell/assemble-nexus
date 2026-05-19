import { db, client } from "../src/db/index.js";
import { venue } from "../src/db/schema/entities/venue.js";
import { vat_rate } from "../src/db/schema/entities/vat_rate.js";
import { role } from "../src/db/schema/entities/role.js";
import { permission } from "../src/db/schema/entities/permission.js";
import { role_permission } from "../src/db/schema/entities/role_permission.js";
import { user_role } from "../src/db/schema/entities/user_role.js";
import { user } from "../src/db/schema/entities/user.js";
import { room } from "../src/db/schema/entities/room.js";
import { room_content_block } from "../src/db/schema/entities/room_content_block.js";
import { capacity_layout } from "../src/db/schema/entities/capacity_layout.js";
import { room_capacity } from "../src/db/schema/entities/room_capacity.js";
import { booking_type } from "../src/db/schema/entities/booking_type.js";
import { deposit_policy } from "../src/db/schema/entities/deposit_policy.js";
import { booking_agreement } from "../src/db/schema/entities/booking_agreement.js";
import { pricing_rule } from "../src/db/schema/entities/pricing_rule.js";
import { facility_category } from "../src/db/schema/entities/facility_category.js";
import { facility_package } from "../src/db/schema/entities/facility_package.js";
import { room_booking_type } from "../src/db/schema/entities/room_booking_type.js";
import { discount } from "../src/db/schema/entities/discount.js";
import { setting } from "../src/db/schema/entities/setting.js";
import { event_organiser } from "../src/db/schema/entities/event_organiser.js";
import { user_event_organiser } from "../src/db/schema/entities/user_event_organiser.js";
import { and, count, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;

const venues = [
    {
        slug: "main",
        name: "The Assembly Rooms",
        timezone: "Europe/London",
        is_active: true,
    },
];

const vatRates = [
    { key: "standard", label: "Standard rate (20%)", percent_x100: 2000 },
    { key: "reduced", label: "Reduced rate (5%)", percent_x100: 500 },
    { key: "zero", label: "Zero rated", percent_x100: 0 },
    { key: "exempt", label: "Exempt", percent_x100: 0 },
];

const roles = [
    { key: "admin", name: "Administrator", description: "Full access to everything." },
    { key: "staff", name: "Staff", description: "Day-to-day operational access." },
    { key: "volunteer", name: "Volunteer", description: "Limited access - own assignments and check-in." },
    { key: "finance", name: "Finance", description: "Finance reports and reconciliation." },
    { key: "hirer", name: "Hirer", description: "Booker portal access - manage own bookings and ticketed events." },
    { key: "delegate", name: "Delegate", description: "Ticket holder portal access - view own ticket orders." },
];

const permissions = [
    { key: "booking.read", name: "Read bookings" },
    { key: "booking.write", name: "Create / edit bookings" },
    { key: "booking.approve", name: "Approve bookings" },
    { key: "room.read", name: "Read rooms" },
    { key: "room.write", name: "Edit rooms" },
    { key: "event.read", name: "Read events" },
    { key: "event.write", name: "Edit events" },
    { key: "ticket.read", name: "Read ticket orders" },
    { key: "ticket.refund", name: "Refund tickets" },
    { key: "ticket.scan", name: "Scan tickets at the door" },
    { key: "finance.read", name: "Read finance data" },
    { key: "finance.write", name: "Edit finance data" },
    { key: "staff.read", name: "Read staff & rota" },
    { key: "staff.write", name: "Edit staff & rota" },
    { key: "file.read", name: "Read files" },
    { key: "file.write", name: "Upload / delete files" },
    { key: "settings.read", name: "Read settings" },
    { key: "settings.write", name: "Edit settings" },
];

// role_key → permission_keys
const rolePermissions = {
    admin: permissions.map((p) => p.key),
    staff: [
        "booking.read", "booking.write",
        "room.read", "event.read", "event.write",
        "ticket.read", "ticket.scan",
        "staff.read",
        "file.read", "file.write",
        "settings.read",
    ],
    volunteer: [
        "booking.read", "event.read", "ticket.scan",
    ],
    finance: [
        "booking.read", "event.read",
        "ticket.read", "ticket.refund",
        "finance.read", "finance.write",
        "settings.read",
    ],
};

async function upsertByKey(table, rows) {
    await db.insert(table).values(rows).onConflictDoNothing({ target: table.key });
    const keys = rows.map((r) => r.key);
    return db.select().from(table).where(inArray(table.key, keys));
}

const bookingTypes = [
    { key: "event", label: "Event day", description: "The main hire - performance, conference, ceremony, etc.", default_rate_modifier_x100: 10000, sort_order: 0 },
    { key: "setup", label: "Setup day", description: "Day before / pre-event for load-in, rigging, rehearsals.", default_rate_modifier_x100: 5000, sort_order: 1 },
    { key: "teardown", label: "Teardown", description: "Day after for load-out and clean-up.", default_rate_modifier_x100: 5000, sort_order: 2 },
    { key: "rehearsal", label: "Rehearsal", description: "Pre-show rehearsal block.", default_rate_modifier_x100: 6000, sort_order: 3 },
];

const defaultDepositPolicy = {
    deposit_pct_x100: 2500,
    non_refundable_pct_x100: 1000,
    refundable_until_days_before: 14,
    is_active: true,
    notes: "25% deposit. 10% of total non-refundable. Remainder refundable up to 14 days before the event.",
};

const facilityCategories = [
    { key: "audio_visual", label: "Audio/Visual", icon: "music", sort_order: 0 },
    { key: "refreshments", label: "Refreshments", icon: "wine-glass", sort_order: 1 },
    { key: "staffing", label: "Staffing", icon: "user-tie", sort_order: 2 },
];

// Pricing examples - keyed by room slug + booking type key
// Other booking types (setup, teardown, rehearsal) inherit from event_day via the type's modifier.
const examplePricingRules = [
    // Concert Hall
    { room_slug: "concert-hall", booking_type_key: "event", rate_kind: "hourly", amount_cents: 15000, vat_rate_key: "zero", vat_inclusive: false, min_hours: 3, sort_order: 0 },
    { room_slug: "concert-hall", booking_type_key: "event", rate_kind: "day", amount_cents: 120000, vat_rate_key: "zero", vat_inclusive: false, sort_order: 1 },
    // The Hall
    { room_slug: "the-hall", booking_type_key: "event", rate_kind: "hourly", amount_cents: 8000, vat_rate_key: "zero", vat_inclusive: false, min_hours: 2, sort_order: 0 },
    { room_slug: "the-hall", booking_type_key: "event", rate_kind: "day", amount_cents: 64000, vat_rate_key: "zero", vat_inclusive: false, sort_order: 1 },
    // The Atrium
    { room_slug: "the-atrium", booking_type_key: "event", rate_kind: "hourly", amount_cents: 6000, vat_rate_key: "zero", vat_inclusive: false, min_hours: 2, sort_order: 0 },
    { room_slug: "the-atrium", booking_type_key: "event", rate_kind: "day", amount_cents: 48000, vat_rate_key: "zero", vat_inclusive: false, sort_order: 1 },
];

const exampleDiscounts = [
    {
        label: "Local Newark business or employer",
        description: "For Newark-based businesses and employers booking a room for their own use.",
        percent_x100: 1000,
        sort_order: 0,
    },
    {
        label: "Newark-based youth activity",
        description: "For activities run for and by young people in the Newark area.",
        percent_x100: 1000,
        sort_order: 1,
    },
    {
        label: "Newark church",
        description: "For other Newark-based churches.",
        percent_x100: 2000,
        sort_order: 2,
    },
];

const defaultBookingAgreement = {
    title: "Booking Agreement",
    intro: "Please read the following terms before paying your deposit. Paying the deposit confirms your acceptance of this agreement.",
    sections: [
        {
            heading: "Health & Safety",
            paragraphs: [
                "Hirers and their guests must observe all venue health and safety procedures. The hirer is responsible for the conduct of their attendees while on site.",
                "Capacity limits for each room layout must not be exceeded. Emergency exits must remain unobstructed at all times.",
            ],
        },
        {
            heading: "Use of the Venue",
            paragraphs: [
                "The venue and its equipment must be used only for the purposes set out in the booking. Any deviation must be agreed with us in advance.",
                "Smoking is not permitted anywhere on the premises. Naked flames (including candles) require prior written approval.",
            ],
        },
        {
            heading: "Damage and Liability",
            paragraphs: [
                "The hirer is responsible for any damage to the venue, fixtures, or equipment caused during their hire and will be invoiced for repair or replacement at cost.",
                "We strongly recommend that hirers arrange suitable public liability insurance.",
            ],
        },
        {
            heading: "Cancellation",
            paragraphs: [
                "The deposit comprises a non-refundable element (10% of the total) and a refundable element. The refundable element is returned in full if the booking is cancelled more than 14 days before the event.",
                "Cancellations within 14 days of the event are non-refundable. We will always try to be reasonable in exceptional circumstances.",
            ],
        },
    ],
    version: "v1.0",
    is_active: true,
};

const capacityLayouts = [
    { key: "theatre", label: "Theatre", icon: "screen-users", sort_order: 0 },
    { key: "cabaret", label: "Cabaret", icon: "champagne-glasses", sort_order: 1 },
    { key: "boardroom", label: "Boardroom", icon: "person-chalkboard", sort_order: 2 },
    { key: "standing", label: "Standing", icon: "people-group", sort_order: 3 },
];

const roomSeeds = [
    {
        slug: "concert-hall",
        name: "Concert Hall",
        tagline: "A 400-capacity main room with a custom-tuned PA and a sprung wooden stage.",
        short_description:
            "Our flagship space. Concerts, conferences, weddings, awards ceremonies. Class-A AV, floor-to-ceiling acoustic treatment, full lighting rig.",
        capacities: { theatre: 320, cabaret: 180, boardroom: 60, standing: 400 },
        av_highlight: "L-Acoustics A15 line array · Allen & Heath dLive · 32-way LED rig",
        accent_hue: "from-cyan-500/15 via-cyan-700/10 to-transparent",
        sort_order: 0,
        is_published: true,
        blocks: [
            {
                type: "prose",
                payload: {
                    paragraphs: [
                        "The Concert Hall is the room everything else in the building is built around. 400 standing, 320 seated, with a sprung wooden stage and a custom-tuned PA that's been dialled in over years.",
                        "Floor-to-ceiling acoustic treatment, full lighting rig, fly system, and a green room with showers. We've hosted symphony orchestras, comedy nights, mid-tier touring rock bands, and the occasional product launch.",
                    ],
                },
            },
            {
                type: "av_package",
                payload: {
                    name: "Standard package",
                    summary: "Included with every Concert Hall hire.",
                    items: [
                        { label: "PA", value: "L-Acoustics A15 line array" },
                        { label: "Console", value: "Allen & Heath dLive C2500" },
                        { label: "Microphones", value: "16-channel SM58/57 + DI inputs" },
                        { label: "Lighting", value: "32-way LED wash + spots" },
                    ],
                },
            },
            {
                type: "av_package",
                payload: {
                    name: "Premium package",
                    summary: "For touring shows and larger productions.",
                    items: [
                        { label: "PA", value: "Standard + L-Acoustics SB15 subs" },
                        { label: "Monitors", value: "4× wedge + IEM split" },
                        { label: "Lighting", value: "Standard + 8 moving heads, haze" },
                        { label: "Backline", value: "Drum kit, bass amp, guitar amp on request" },
                    ],
                },
            },
            {
                type: "av_package",
                payload: {
                    name: "Bring your own",
                    summary: "Touring techs, bring it. Our crew will help you load in and patch up.",
                    items: [
                        { label: "Power", value: "63A 3-phase + 32A single-phase" },
                        { label: "Patch", value: "Full multicore to FoH" },
                        { label: "Loading", value: "Truck-level loading bay" },
                    ],
                },
            },
        ],
    },
    {
        slug: "the-hall",
        name: "The Hall",
        tagline: "A flexible 180-capacity room for talks, receptions, and rehearsals.",
        short_description:
            "High ceilings, blackout drapes, fast turnaround. Equally at home for a panel of 40 or a launch party of 180.",
        capacities: { theatre: 120, cabaret: 80, boardroom: 40, standing: 180 },
        av_highlight: "QSC K12.2 system · 4K projector · stage lighting",
        accent_hue: "from-emerald-500/15 via-teal-700/10 to-transparent",
        sort_order: 1,
        is_published: true,
        blocks: [
            {
                type: "prose",
                payload: {
                    paragraphs: [
                        "The Hall is built for fast turnarounds. Blackout drapes drop from the ceiling in two minutes and the stacked seating reconfigures from theatre to cabaret to standing in under fifteen.",
                        "It's the room you want for an all-day conference that turns into a launch party at 6pm.",
                    ],
                },
            },
            {
                type: "av_package",
                payload: {
                    name: "Standard package",
                    summary: "Everything you need for a panel, talk, or reception.",
                    items: [
                        { label: "PA", value: "QSC K12.2 stereo system" },
                        { label: "Projection", value: "4K laser projector + 4m drop screen" },
                        { label: "Microphones", value: "4× wireless handheld + 2× lapel" },
                        { label: "Lighting", value: "House + stage wash" },
                    ],
                },
            },
        ],
    },
    {
        slug: "the-atrium",
        name: "The Atrium",
        tagline: "An 80-capacity reception space with natural light and a working bar.",
        short_description:
            "Glass front, polished concrete floor, integrated bar. Drinks receptions, art previews, intimate book launches.",
        capacities: { cabaret: 50, standing: 80 },
        av_highlight: "Bose distributed audio · ambient lighting · bar service",
        accent_hue: "from-amber-400/15 via-orange-600/10 to-transparent",
        sort_order: 2,
        is_published: true,
        blocks: [
            {
                type: "prose",
                payload: {
                    paragraphs: [
                        "The Atrium is the room people remember. Glass-fronted, naturally lit by day, candle-lit by night, with a working bar that's stocked from our café.",
                        "Best for drinks receptions, art previews, intimate book launches, and the quieter half of a two-room event.",
                    ],
                },
            },
            {
                type: "av_package",
                payload: {
                    name: "Bar package",
                    summary: "All-in for receptions and launches.",
                    items: [
                        { label: "Audio", value: "Bose distributed in-ceiling" },
                        { label: "Lighting", value: "Dimmable ambient + accent" },
                        { label: "Bar", value: "Two bar staff, glassware, ice" },
                        { label: "Microphones", value: "1× wireless handheld for speeches" },
                    ],
                },
            },
        ],
    },
];

function blockSectionFor(type) {
    if (type === "av_package") return "facilities";
    return "about";
}

function blockCategoryFor(type) {
    if (type === "av_package") return "audio_visual";
    return null;
}

async function migrateDayRulesToCaps(venueId) {
    const dayRules = await db
        .select()
        .from(pricing_rule)
        .where(
            and(
                eq(pricing_rule.venue_id, venueId),
                eq(pricing_rule.rate_kind, "day"),
                isNull(pricing_rule.deletedAt),
            ),
        );
    if (dayRules.length === 0) return;
    console.log("Migrating day rules → daily caps on hourly rules…");
    let migrated = 0;
    for (const dayRule of dayRules) {
        const conditions = [
            eq(pricing_rule.venue_id, venueId),
            eq(pricing_rule.booking_type_id, dayRule.booking_type_id),
            eq(pricing_rule.rate_kind, "hourly"),
            isNull(pricing_rule.deletedAt),
        ];
        if (dayRule.room_id == null) {
            conditions.push(isNull(pricing_rule.room_id));
        } else {
            conditions.push(eq(pricing_rule.room_id, dayRule.room_id));
        }
        const [hourlyRule] = await db
            .select()
            .from(pricing_rule)
            .where(and(...conditions))
            .limit(1);
        if (hourlyRule && (hourlyRule.daily_cap_cents == null || hourlyRule.daily_cap_cents === 0)) {
            await db
                .update(pricing_rule)
                .set({ daily_cap_cents: dayRule.amount_cents })
                .where(eq(pricing_rule.id, hourlyRule.id));
        }
        await db
            .update(pricing_rule)
            .set({ deletedAt: new Date() })
            .where(eq(pricing_rule.id, dayRule.id));
        migrated += 1;
    }
    console.log(`  migrated ${migrated} day rules`);
}

async function seedRoomBookingTypes(venueId) {
    console.log("Seeding room booking types…");
    const [rooms, types] = await Promise.all([
        db.select().from(room).where(eq(room.venue_id, venueId)),
        db.select().from(booking_type).where(isNull(booking_type.deletedAt)),
    ]);
    let inserted = 0;
    for (const r of rooms) {
        for (const t of types) {
            await db
                .insert(room_booking_type)
                .values({ room_id: r.id, booking_type_id: t.id, sort_order: t.sort_order })
                .onConflictDoNothing();
            inserted += 1;
        }
    }
    console.log(`  room×type links: ${inserted} attempted (existing skipped)`);
}

async function migrateAvBlocksToFacilityPackages(venueId) {
    console.log("Migrating av_package blocks → facility_package rows…");
    const [avCat] = await db
        .select()
        .from(facility_category)
        .where(eq(facility_category.key, "audio_visual"))
        .limit(1);
    if (!avCat) return;

    const rooms = await db.select().from(room).where(eq(room.venue_id, venueId));
    let migrated = 0;
    for (const r of rooms) {
        const blocks = await db
            .select()
            .from(room_content_block)
            .where(
                and(
                    eq(room_content_block.room_id, r.id),
                    eq(room_content_block.type, "av_package"),
                    isNull(room_content_block.deletedAt),
                ),
            )
            .orderBy(room_content_block.sort_order);
        for (const b of blocks) {
            const name = b.payload?.name?.trim() || "Untitled package";
            const existing = await db
                .select({ id: facility_package.id })
                .from(facility_package)
                .where(
                    and(
                        eq(facility_package.room_id, r.id),
                        eq(facility_package.category_id, avCat.id),
                        eq(facility_package.name, name),
                    ),
                )
                .limit(1);
            if (existing.length) continue;
            await db.insert(facility_package).values({
                room_id: r.id,
                category_id: avCat.id,
                name,
                summary: b.payload?.summary ?? null,
                items: Array.isArray(b.payload?.items) ? b.payload.items : [],
                price_cents: 0,
                vat_inclusive: false,
                sort_order: b.sort_order ?? 0,
                is_active: true,
            });
            await db
                .update(room_content_block)
                .set({ deletedAt: new Date() })
                .where(eq(room_content_block.id, b.id));
            migrated += 1;
        }
    }
    console.log(`  migrated ${migrated} blocks`);
}

async function seedPricingRules(venueId) {
    console.log("Seeding example pricing rules…");

    const [roomRows, btRows, vrRows] = await Promise.all([
        db.select().from(room).where(eq(room.venue_id, venueId)),
        db.select().from(booking_type),
        db.select().from(vat_rate),
    ]);
    const roomBySlug = new Map(roomRows.map((r) => [r.slug, r]));
    const btByKey = new Map(btRows.map((b) => [b.key, b]));
    const vrByKey = new Map(vrRows.map((v) => [v.key, v]));

    let inserted = 0;
    let skipped = 0;
    for (const r of examplePricingRules) {
        const targetRoom = roomBySlug.get(r.room_slug);
        const bt = btByKey.get(r.booking_type_key);
        const vr = r.vat_rate_key ? vrByKey.get(r.vat_rate_key) : null;
        if (!targetRoom || !bt) {
            skipped += 1;
            continue;
        }
        const existing = await db
            .select({ id: pricing_rule.id })
            .from(pricing_rule)
            .where(
                and(
                    eq(pricing_rule.venue_id, venueId),
                    eq(pricing_rule.room_id, targetRoom.id),
                    eq(pricing_rule.booking_type_id, bt.id),
                    eq(pricing_rule.rate_kind, r.rate_kind),
                ),
            )
            .limit(1);
        if (existing.length) {
            skipped += 1;
            continue;
        }
        await db.insert(pricing_rule).values({
            venue_id: venueId,
            room_id: targetRoom.id,
            booking_type_id: bt.id,
            rate_kind: r.rate_kind,
            amount_cents: r.amount_cents,
            vat_rate_id: vr?.id ?? null,
            vat_inclusive: !!r.vat_inclusive,
            min_hours: r.min_hours ?? null,
            min_days: r.min_days ?? null,
            sort_order: r.sort_order ?? 0,
        });
        inserted += 1;
    }
    console.log(`  pricing rules: ${inserted} inserted, ${skipped} skipped`);
}

async function seedRooms(venueId) {
    console.log("Seeding rooms…");

    const layoutRows = await db.select().from(capacity_layout);
    const layoutByKey = new Map(layoutRows.map((l) => [l.key, l]));

    for (const seed of roomSeeds) {
        const { blocks, capacities, ...roomFields } = seed;
        await db
            .insert(room)
            .values({ ...roomFields, venue_id: venueId })
            .onConflictDoNothing({ target: [room.venue_id, room.slug] });

        const [r] = await db
            .select()
            .from(room)
            .where(and(eq(room.venue_id, venueId), eq(room.slug, seed.slug)))
            .limit(1);
        if (!r) continue;

        if (capacities && Object.keys(capacities).length) {
            const rows = Object.entries(capacities)
                .map(([key, value]) => {
                    const layout = layoutByKey.get(key);
                    if (!layout) return null;
                    return { room_id: r.id, layout_id: layout.id, value: Number(value) };
                })
                .filter(Boolean);
            if (rows.length) {
                await db.insert(room_capacity).values(rows).onConflictDoNothing();
            }
        }

        const [{ value: existingBlocks }] = await db
            .select({ value: count() })
            .from(room_content_block)
            .where(eq(room_content_block.room_id, r.id));

        if (Number(existingBlocks) === 0 && blocks?.length) {
            await db.insert(room_content_block).values(
                blocks.map((b, i) => ({
                    room_id: r.id,
                    type: b.type,
                    section: blockSectionFor(b.type),
                    category: blockCategoryFor(b.type),
                    payload: b.payload,
                    sort_order: i,
                })),
            );
            console.log(`  ${seed.slug}: ${blocks.length} blocks`);
        } else {
            console.log(`  ${seed.slug}: already has ${existingBlocks} blocks - skipping insert`);
        }
    }

    // Backfill section/category on any pre-existing blocks
    const backfillProse = await db
        .update(room_content_block)
        .set({ section: "about" })
        .where(and(eq(room_content_block.type, "prose"), isNull(room_content_block.section)))
        .returning({ id: room_content_block.id });

    const backfillAv = await db
        .update(room_content_block)
        .set({ section: "facilities", category: "audio_visual" })
        .where(and(eq(room_content_block.type, "av_package"), isNull(room_content_block.section)))
        .returning({ id: room_content_block.id });

    if (backfillProse.length || backfillAv.length) {
        console.log(`  backfilled section: ${backfillProse.length} prose, ${backfillAv.length} av_package`);
    }
}

async function main() {
    console.log("Seeding venues…");
    await db.insert(venue).values(venues).onConflictDoNothing({ target: venue.slug });

    const [seedVenue] = await db.select().from(venue).where(eq(venue.slug, "main")).limit(1);

    console.log("Seeding VAT rates…");
    await upsertByKey(vat_rate, vatRates);

    console.log("Seeding roles…");
    const roleRows = await upsertByKey(role, roles);
    const roleByKey = new Map(roleRows.map((r) => [r.key, r]));

    console.log("Seeding permissions…");
    const permRows = await upsertByKey(permission, permissions);
    const permByKey = new Map(permRows.map((p) => [p.key, p]));

    console.log("Linking roles → permissions…");
    const links = [];
    for (const [roleKey, permKeys] of Object.entries(rolePermissions)) {
        const r = roleByKey.get(roleKey);
        if (!r) continue;
        for (const pk of permKeys) {
            const p = permByKey.get(pk);
            if (!p) continue;
            links.push({ role_id: r.id, permission_id: p.id });
        }
    }
    if (links.length) {
        await db.insert(role_permission).values(links).onConflictDoNothing();
    }

    console.log("Seeding capacity layouts…");
    for (const cl of capacityLayouts) {
        await db
            .insert(capacity_layout)
            .values(cl)
            .onConflictDoUpdate({
                target: capacity_layout.key,
                set: { label: cl.label, icon: cl.icon, sort_order: cl.sort_order },
            });
    }

    console.log("Seeding facility categories…");
    for (const fc of facilityCategories) {
        await db
            .insert(facility_category)
            .values(fc)
            .onConflictDoUpdate({
                target: facility_category.key,
                set: { label: fc.label, icon: fc.icon, sort_order: fc.sort_order, deletedAt: null },
            });
    }
    const wantedKeys = facilityCategories.map((c) => c.key);
    const removed = await db
        .update(facility_category)
        .set({ deletedAt: new Date() })
        .where(and(notInArray(facility_category.key, wantedKeys), isNull(facility_category.deletedAt)))
        .returning({ key: facility_category.key });
    if (removed.length) console.log(`  retired categories: ${removed.map((r) => r.key).join(", ")}`);

    if (seedVenue) {
        await seedRooms(seedVenue.id);

        console.log("Seeding booking types…");
        for (const bt of bookingTypes) {
            await db
                .insert(booking_type)
                .values(bt)
                .onConflictDoUpdate({
                    target: booking_type.key,
                    set: {
                        label: bt.label,
                        description: bt.description,
                        default_rate_modifier_x100: bt.default_rate_modifier_x100,
                        sort_order: bt.sort_order,
                    },
                });
        }

        const existingDp = await db
            .select()
            .from(deposit_policy)
            .where(eq(deposit_policy.venue_id, seedVenue.id))
            .limit(1);
        if (existingDp.length === 0) {
            console.log("Seeding default deposit policy…");
            await db.insert(deposit_policy).values({ ...defaultDepositPolicy, venue_id: seedVenue.id });
        }

        const existingBa = await db
            .select()
            .from(booking_agreement)
            .where(eq(booking_agreement.venue_id, seedVenue.id))
            .limit(1);
        if (existingBa.length === 0) {
            console.log("Seeding default booking agreement…");
            await db.insert(booking_agreement).values({ ...defaultBookingAgreement, venue_id: seedVenue.id });
        }

        await seedPricingRules(seedVenue.id);
        await migrateDayRulesToCaps(seedVenue.id);
        await seedRoomBookingTypes(seedVenue.id);
        await migrateAvBlocksToFacilityPackages(seedVenue.id);

        const existingDiscounts = await db
            .select({ label: discount.label })
            .from(discount)
            .where(eq(discount.venue_id, seedVenue.id));
        if (existingDiscounts.length === 0) {
            console.log("Seeding example discounts…");
            await db
                .insert(discount)
                .values(exampleDiscounts.map((d) => ({ ...d, venue_id: seedVenue.id })));
        }

        const existingTicketing = await db
            .select()
            .from(setting)
            .where(and(eq(setting.venue_id, seedVenue.id), eq(setting.key, "ticketing")))
            .limit(1);
        if (existingTicketing.length === 0) {
            console.log("Seeding default ticketing settings…");
            await db.insert(setting).values({
                venue_id: seedVenue.id,
                key: "ticketing",
                value: { platform_fee_pct_x100: 200, platform_fee_flat_cents: 50 },
            });
        }

        const existingBands = await db
            .select()
            .from(setting)
            .where(and(eq(setting.venue_id, seedVenue.id), eq(setting.key, "hourly_bands")))
            .limit(1);
        if (existingBands.length === 0) {
            console.log("Seeding default hourly bands…");
            await db.insert(setting).values({
                venue_id: seedVenue.id,
                key: "hourly_bands",
                value: {
                    bands: [
                        { label: "Early", from: "07:00", to: "09:00", modifier_x100: 12000 },
                        { label: "Standard", from: "09:00", to: "17:00", modifier_x100: 10000 },
                        { label: "Evening", from: "17:00", to: "21:00", modifier_x100: 12000 },
                        { label: "Late", from: "21:00", to: "24:00", modifier_x100: 13000 },
                    ],
                },
            });
        }
    } else {
        console.warn("No venue found - skipping room seed.");
    }

    if (SEED_ADMIN_EMAIL) {
        console.log(`Granting admin role to ${SEED_ADMIN_EMAIL}…`);
        const [u] = await db.select().from(user).where(eq(user.email, SEED_ADMIN_EMAIL)).limit(1);
        const adminRole = roleByKey.get("admin");
        if (u && adminRole) {
            await db
                .insert(user_role)
                .values({ user_id: u.id, role_id: adminRole.id })
                .onConflictDoNothing();
            console.log("  done.");
        } else if (!u) {
            console.warn(`  user not found: ${SEED_ADMIN_EMAIL}`);
        }
    } else {
        console.log("SEED_ADMIN_EMAIL not set - skipping admin grant.");
    }

    if (seedVenue) {
        console.log("Seeding event organisers…");
        const organisers = [
            {
                venue_id: seedVenue.id,
                slug: "the-assembly-rooms",
                name: "The Assembly Rooms",
                email_domain: "theassemblyrooms.co.uk",
                contact_email: null,
                notes: "House organiser - used for venue-run events.",
            },
            {
                venue_id: seedVenue.id,
                slug: "assemble-church",
                name: "Assemble Church",
                email_domain: "assemblechurch.com",
                contact_email: null,
                notes: "Sister organisation - church-run events.",
            },
        ];
        for (const o of organisers) {
            await db
                .insert(event_organiser)
                .values(o)
                .onConflictDoNothing({ target: [event_organiser.venue_id, event_organiser.slug] });
        }

        if (SEED_ADMIN_EMAIL) {
            const [adminUser] = await db.select().from(user).where(eq(user.email, SEED_ADMIN_EMAIL)).limit(1);
            if (adminUser) {
                const organiserRows = await db
                    .select()
                    .from(event_organiser)
                    .where(eq(event_organiser.venue_id, seedVenue.id));
                for (const o of organiserRows) {
                    await db
                        .insert(user_event_organiser)
                        .values({ user_id: adminUser.id, event_organiser_id: o.id, role: "admin" })
                        .onConflictDoNothing();
                }
                console.log(`  linked ${SEED_ADMIN_EMAIL} to ${organiserRows.length} organiser(s).`);
            }
        }
    }

    console.log("Seed complete.");
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await client.end({ timeout: 5 });
    });
