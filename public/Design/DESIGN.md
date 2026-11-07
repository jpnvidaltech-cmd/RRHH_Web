---
name: Talent Intelligence Warm Minimal
colors:
  surface: '#faf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#faf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#e9e8e5'
  surface-container-highest: '#e3e2df'
  on-surface: '#1a1c1a'
  on-surface-variant: '#45474c'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f2f1ee'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#a13e28'
  on-secondary: '#ffffff'
  secondary-container: '#fd8367'
  on-secondary-container: '#721c09'
  tertiary: '#00190e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00301e'
  on-tertiary-container: '#00a472'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#ffdad2'
  secondary-fixed-dim: '#ffb4a3'
  on-secondary-fixed: '#3d0600'
  on-secondary-fixed-variant: '#822714'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#faf9f6'
  on-background: '#1a1c1a'
  surface-variant: '#e3e2df'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 1.75rem
  space-xl: 2.5rem
---

## Brand & Style

This design system reimagines recruitment intelligence platforms by breaking away from cold, dark, generic developer-dashboard patterns and replacing them with a warm, human-centric, editorial executive aesthetic. Geared toward People Operations, Talent Acquisition Leaders, and Executive Recruiters, it embodies calm authority, precision, and approachability.

### Visual Pillars
- **Warm Editorial Modernism:** An inviting palette anchored in warm off-white and linen tones (#FBFBF9 / #F6F5F2) paired with deep navy-slate (#1E293B) provides high readability and reduces visual fatigue during high-volume resume evaluations.
- **Humanized Intelligence:** AI insights are treated as trusted advisors, not black-box algorithms. Match scores, skill gaps, and semantic strengths are illuminated with organic terracotta (#E06D53), honey amber (#D97706), and soft mint emerald (#10B981).
- **Tactile Clarity:** Smooth pill forms, generous 16px to 24px corner radii, subtle borders with micro-tinted shadows, and structured data layouts prioritize scan speed and holistic candidate storytelling over raw tabular density.

## Colors

The palette establishes an organic, distraction-free environment that softens long talent evaluation sessions while sustaining crisp contrast.

### Palette Architecture
- **Primary (`#1E293B`):** Deep Slate Navy. Used for authoritative typography, active navigation states, primary search buttons, and key structural anchors.
- **Secondary (`#E06D53`):** Warm Terracotta / Spiced Peach. Reserved for primary calls-to-action, high-intent actions (e.g., compare profiles, run AI synthesis), and active filtering states.
- **Tertiary (`#10B981`):** Gentle Mint Emerald. Applied to high compatibility badges (90%+ match), verified skills, status pips, and positive candidate signals. Paired with soft mint container fills (`#ECFDF5`).
- **Neutral Background (`#F8F7F4` & `#FFFFFF`):** Warm alabaster canvas with pure white elevated cards. Creates distinct depth without relying on harsh dark boundaries.
- **Accent Amber (`#D97706` / `#FEF3C7`):** Dedicated to AI rating scores (e.g., `8.5/10`, `9/10`) and benchmark flags, providing an instant visual anchor across candidate cards.

## Typography

Typographic scale is constructed with **Plus Jakarta Sans**, offering a balance between geometric precision and friendly humanist curves that suit people-first digital workspaces.

- **Headlines:** Set in 600 and 700 weights with snug line heights, conveying warmth, authority, and confidence.
- **Body:** Calibrated at 14px for candidate summaries, bullet points, and comparative lists, keeping scanning effortless without clutter.
- **Labels & Badges:** Use semi-bold 11px and 12px for categorical pills, score indicators, match percentages, and timestamp metadata.

## Layout & Spacing

The layout replaces monolithic single-canvas views with a flexible, dual-zone architecture:

### Architectural Grid
- **Global Frame:** A fixed 280px left rail dedicated to CV intake (drag-and-drop zone, indexed database count, and recent imports) alongside a flexible fluid main canvas for profile querying, candidate cards, and side-by-side matrices.
- **Gutter & Margins:** Desktop spacing utilizes a generous 1.5rem (24px) gutter with 2rem (32px) margins to ensure clear separation between filters, candidate summary blocks, and scoring indicators.
- **Responsive Adaptations:**
  - **Desktop (≥ 1280px):** 3-to-4 column candidate grid for side-by-side comparative scans.
  - **Tablet (768px - 1279px):** 2-column card layout with collapsible upload sidebar into an off-canvas drawer.
  - **Mobile (< 768px):** Single vertical stack with swipeable comparative inspection sheets and sticky bottom action drawers.

## Elevation & Depth

This design system avoids harsh pitch-black drop shadows in favor of ambient multi-stop diffusions tinted with subtle warm slate.

### Elevation Levels
- **Canvas Base (Level 0):** `#F8F7F4` matte surface.
- **Card Tier 1 (Resting):** Pure white `#FFFFFF` surface bordered with `1px solid rgba(30, 41, 59, 0.06)`, supported by `box-shadow: 0 1px 3px rgba(30, 41, 59, 0.04), 0 4px 12px rgba(30, 41, 59, 0.03)`.
- **Interactive / Hover Tier 2:** `#FFFFFF` surface lifted with `transform: translateY(-2px)`, accompanied by `box-shadow: 0 8px 24px rgba(30, 41, 59, 0.07), 0 2px 6px rgba(30, 41, 59, 0.04)` and border accentuation in `#E2E8F0`.
- **Active AI Synthesis / Focus Tier 3:** Border illuminated with an ethereal 2px halo in terracotta tint `rgba(224, 109, 83, 0.25)` or soft mint `rgba(16, 185, 129, 0.20)`.
- **Modals & Overlays:** Background scrim in warm slate (`rgba(30, 41, 59, 0.40)`) with backdrop blur of 12px.

## Shapes

The form language is organic and approachable, eliminating sharp, intimidating corners.

- **Primary Cards & Containers:** Styled with `1rem` to `1.25rem` (16px - 20px) radius, creating a comfortable, polished card contour.
- **Interactive Buttons & Inputs:** Form elements, semantic search boxes, and drop areas leverage `0.75rem` (12px) to `1rem` (16px) curvature.
- **Score Indicators & Chips:** Rendered as full pills (`9999px`) to visually distinguish metadata and AI evaluation scores from structural containers.

## Components

### 1. Natural Language Search & Prompt Field
- **Structure:** Expansive multi-line input box nestled in pure white with a soft border (`#E2E8F0`).
- **Interaction:** Shifts to a soft terracotta ring focus state (`#E06D53` with 20% opacity spread). Includes an integrated AI prompt helper chip ("Senior React Developer", "Tech Lead with bilingual Spanish/English").
- **CTA:** Primary search button anchored in deep slate navy (`#1E293B`) or rich terracotta (`#E06D53`) with white text, 12px corner rounding, and an integrated sparkle/search icon.

### 2. Candidate Evaluation Cards
- **Header:** Features an avatar with warm initials background, candidate name in bold 16px slate, geographical badge, and prominent right-aligned AI score pill.
- **Score Pill:** Highlighted in amber/honey (`bg: #FEF3C7`, `text: #92400E`, `border: 1px solid #FDE68A`) for ratings like `8.5 / 10` or `9 / 10`.
- **Body Hierarchy:**
  - Role match badge: Pill in soft emerald (`bg: #ECFDF5`, `text: #065F46`).
  - Bulleted synthesis: Semantic breakdown (Experience, Skills, Education, Languages) with subtle bullet markers in terracotta tint.
- **Actions:** Quick CV preview action button with light outline and document icon.

### 3. Drag-and-Drop Resume Ingestion Zone
- **Visuals:** Dashed border in warm slate (`rgba(30, 41, 59, 0.15)`), tinted cream background (`#F4F2ED`), accompanied by a soft document cloud icon.
- **Feedback:** On drag-over, turns to soft terracotta tint (`#FFF7ED`) with a 1.5px dashed border in `#E06D53`.

### 4. Comparison Matrix & Chips
- **Chips:** Soft rounded tags (`px-3`, `py-1`, 12px typography) with light slate or mint fills to quickly compare candidate core stacks side-by-side.
- **Match Meters:** Compact horizontal bar with emerald fill for match score and neutral slate track for instant visual benchmarking.

### 5. Table & List Views (Database Index)
- **Layout:** Replaces the heavy navy background with an airy, zebra-free white card container. Subtle border dividers (`#F1F5F9`), warm slate hover highlights (`#FAF9F6`), and crisp contextual actions.