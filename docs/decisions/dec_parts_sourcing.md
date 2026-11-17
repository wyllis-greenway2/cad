---
id: dec_parts_sourcing
kind: decision
status: accepted
origin: ai-proposed-human-approved
human_input: in_688, in_689, in_690
date: 2026-11-17
depends_on:
  - dec_parts_library: offers attach to a library part (a family's numbers or an entry) and are kept apart from its geometry
  - dec_manufacturing_contract: a made part's time and cost come from its manufacturing plan, so the bill of materials rolls up bought and made parts together
alternative_to:
---
# Where parts are bought: offers, and a cost and lead time breakdown for an assembly

**Accepted by the human (`in_690`) as proposed by the AI from `in_688`. Nothing built.** The human asked how and where parts are bought, with lead times, so an assembly has a full cost and lead time breakdown.

1. **Three things kept apart:** the geometry (generator or file), the identity (family and numbers, or an entry), and the *offers*: vendor, part number, price breaks, pack size, stock and lead time, each stamped with the date it was true. A **mapping** says which vendor part number matches which identity (for example "M3 x 12 pan head" to a vendor's number). Identity never depends on a vendor.
2. **The bill of materials is computed from the assembly:** each distinct part, how many, and the offer chosen. **Cost counts pack sizes** (a bag of 100 for a project that needs 6 is the price paid, and the bill says what is left over) and shipping where known. Made parts add the material and machine time from their manufacturing plans.
3. **Lead time:** bought parts arrive in parallel, so their lead time is the longest of them; made parts add their route time (material, machine time, queue); the breakdown names the part that sets the total. Every figure shows its "as of" date and says when it is stale.
4. **Prices and stock change, so the data comes in steps:** (a) **manual or user-supplied** vendors and prices with a date, from the first version; (b) vendor APIs where they exist and their terms allow it (electronics distributors have them; mechanical suppliers are mostly account-only); (c) vendor links or partnerships later. **No scraping of vendor sites:** it breaks and breaks their terms.
5. **Advise, never block** (`in_546`): a part with no offer, an offer out of date, or a lead time that is unknown shows a finding; the bill is still made, with the gap marked.

## Rationale

Geometry that is free of vendors can be shared and kept for ever; offers go stale in days, so they are separate data with dates. Pack sizes are how fasteners are really bought, and ignoring them makes a cost breakdown wrong. Parallel buying makes the longest lead time the one that matters, and tying in the manufacturing plans gives one view of bought and made parts.
