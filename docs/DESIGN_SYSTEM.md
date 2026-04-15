# Design System Strategy: The Architectural Intelligence

## 1. Overview & Creative North Star
**Creative North Star: "The Precise Curator"**

In the world of high-density enterprise management, "clean" is often a euphemism for "sterile." This design system rejects the sterile grid in favor of **Architectural Intelligence**. We are not building a spreadsheet; we are building a command center that feels like an editorial masterpiece. 

The "Precise Curator" ethos balances the heavy data requirements of the cpamc framework with a sophisticated, layered aesthetic. We break the "template" look by utilizing intentional asymmetry in sidebar-to-content ratios and employing a high-contrast typography scale that distinguishes between *navigation* and *analysis*. By removing traditional 1px borders and replacing them with tonal depth, we create a UI that breathes, even when packed with complex data.

---

## 2. Colors: Tonal Depth over Linework
Our palette moves away from the "outlined box" mentality. We use a sophisticated spectrum of blues and grays to define space through light and shadow rather than ink.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders (`outline`) for sectioning content. Boundaries must be defined solely through background color shifts.
- A card should sit as `surface-container-lowest` (#ffffff) against a `surface` background (#f7f9fc). 
- If a secondary grouping is needed within that card, use `surface-container-low` (#f2f4f7) to "recess" the area.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
- **Base Layer:** `surface` (#f7f9fc)
- **Primary Layout Blocks:** `surface-container` (#eceef1)
- **Actionable Cards/Containers:** `surface-container-lowest` (#ffffff) — This creates a "lifted" appearance without a shadow.
- **Recessed Areas (Data tables/Inputs):** `surface-container-high` (#e6e8eb)

### The Glass & Gradient Rule
To prevent the enterprise system from feeling "heavy," floating elements (Detail Drawers, Modals, Tooltips) should utilize **Glassmorphism**.
- **Background:** `surface_variant` at 80% opacity.
- **Effect:** `backdrop-blur: 12px`.
- **Signature Textures:** For high-level summary cards, use a subtle linear gradient: `primary` (#005daa) to `primary_container` (#0075d5) at a 135-degree angle. This adds a "jewel-like" quality to key performance indicators.

---

## 3. Typography: The Editorial Hierarchy
We use a dual-font system to separate "System Logic" from "Human Insight."

*   **Display & Headline (Manrope):** This is our "Editorial" voice. Use `display-sm` or `headline-md` for page titles and large summary numbers. The geometric nature of Manrope feels modern and authoritative.
*   **Body & Labels (Inter):** This is our "Utility" voice. Inter is used for all data-heavy tables, forms, and navigation items. Its high x-height ensures legibility at the `body-sm` (0.75rem) level required for high-density interfaces.

**The Hierarchy Rule:** Always pair a `headline-sm` title with a `label-md` uppercase subheader (using `on_surface_variant`) to create a clear "Newsroom" style information architecture.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "web 2.0." We achieve depth through the **Layering Principle**.

*   **Ambient Shadows:** If a floating element (like a detail drawer) requires a shadow, it must be "Ambient": 
    *   `box-shadow: 0 12px 40px rgba(25, 28, 30, 0.06);` 
    *   The shadow is never black; it is a tinted version of `on_surface`.
*   **The Ghost Border Fallback:** For accessibility in high-density tables, you may use a "Ghost Border." 
    *   **Token:** `outline_variant` at 15% opacity.
    *   **Rule:** Never use 100% opaque borders for rows. Use a 1px `surface-container-highest` background shift on hover instead.

---

## 5. Components: High-Density Refinement

### Buttons (The Anchor)
*   **Primary:** `primary` background with `on_primary` text. Use `lg` (0.5rem) roundedness. No border.
*   **Secondary:** `secondary_container` background. This provides a softer, "recessed" look compared to a ghost button.
*   **Tertiary:** Transparent background with `primary` text. Use only for low-priority actions.

### High-Density Tables (The Core)
*   **Rule:** Forbid divider lines.
*   **Styling:** Use `spacing-2.5` for vertical cell padding. Header row should be `surface-container-high` with `label-sm` bold typography.
*   **Alternating Rows:** Use `surface-container-low` for every second row to guide the eye without adding visual "noise."

### Summary Cards
*   **Structure:** `surface-container-lowest` background, `xl` (0.75rem) corner radius.
*   **Metric:** Use `display-sm` for the primary number, colored with `primary` to draw the eye immediately.
*   **Icons:** Place icons in a `primary_fixed_dim` circular container with 20% opacity.

### Filter Bars & Input Fields
*   **Fields:** Use `surface-container-low` as the background for inputs rather than a white box with a border. This makes the input feel like a "carved" part of the interface.
*   **Active State:** Use a 2px `primary` bottom-border only (the "Underline Focus") to keep the interface looking sleek and editorial.

### Detail Drawers (The Glass Layer)
*   **Style:** Drawers should use the Glassmorphism rule. When a drawer slides out, the main content area should scale down slightly (98%) and dim to `surface_dim` to create a physical sense of focus.

---

## 6. Do's and Don'ts

### Do
*   **DO** use whitespace as a separator. If you think you need a line, add `spacing-4` instead.
*   **DO** use `secondary_fixed` for "Tag" or "Chip" backgrounds to keep them distinct from action buttons.
*   **DO** utilize `tertiary` (#934600) sparingly for "Neutral Warnings" or financial alerts that don't require the "Stop" energy of `error`.

### Don'ts
*   **DON'T** use pure black (#000000) for text. Use `on_surface` (#191c1e) to maintain a premium, soft-contrast look.
*   **DON'T** use the `DEFAULT` roundedness for everything. Use `xl` for large cards and `sm` for small utility buttons to create a "nested" visual language.
*   **DON'T** ever use high-contrast, 100% opaque borders. If you can't see the separation, your background tonal shifts aren't strong enough. Increase the delta between `surface` and `surface-container`.