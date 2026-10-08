# Someday --- Local Screenshot Inbox

## 1. Project Overview

**Someday** is a local-first personal application for turning a
cluttered collection of screenshots into a useful, browsable collection
of things the user wants to remember, visit, eat, buy, experience, or
learn about.

The application is initially:

-   Mac-only
-   For personal use
-   Local/private
-   Accessible as a local web application
-   Backed by a simple local JSON database
-   Intended for roughly 100+ screenshots initially

The core problem is **not simply screenshot organisation**.

The user saves screenshots because they think:

> "I might want to do this someday."

Over time, those screenshots accumulate in Photos and become difficult
and mentally tiring to revisit.

The goal is therefore:

> **Turn a pile of screenshots into a calm, understandable collection of
> things the user has saved for later.**

The application should reduce the psychological burden of revisiting
saved screenshots rather than turn organisation itself into another
chore.

------------------------------------------------------------------------

# 2. Product Philosophy

The application should follow these principles.

### 2.1 Reduce overwhelm

The app should never make the user feel like they have another giant
backlog to process.

Avoid presenting the user with:

> "You have 137 screenshots to organise."

Instead, present:

> "Here are some things you saved for later."

### 2.2 Preserve the original

The original screenshot remains valuable.

The application should keep:

1.  The original image
2.  Extracted OCR text
3.  Structured information about the screenshot

The structured representation is a convenience layer, not a replacement
for the original.

### 2.3 Automate the boring parts

The user should not have to manually enter:

-   Restaurant name
-   Location
-   Price
-   Category
-   Why they saved it

where these can reasonably be inferred.

### 2.4 Don't over-organise

The user should not be forced to maintain a complicated tagging or
folder system.

The system should do most of the organisation automatically.

### 2.5 Keep the user in control

Automatic interpretation should always be editable.

Original screenshots should never be automatically deleted.

------------------------------------------------------------------------

# 3. Core User Problem

The typical situation:

``` text
User sees something interesting
        ↓
Takes screenshot
        ↓
"I'll look at this later"
        ↓
More screenshots accumulate
        ↓
100+ screenshots
        ↓
User wants to find something
        ↓
Searches through Photos
        ↓
Gets overwhelmed / gives up
```

The application should change this to:

``` text
Interesting thing
        ↓
Screenshot
        ↓
Import into Someday
        ↓
Automatic understanding
        ↓
Clean personal collection
        ↓
Future user can quickly understand
what each screenshot was saved for
```

------------------------------------------------------------------------

# 4. Example

A screenshot may contain:

-   A restaurant photo
-   Instagram username
-   Restaurant name
-   Address
-   Menu
-   Prices
-   Opening hours
-   A long recommendation caption
-   Comments or unrelated interface elements

OCR alone might extract a large block of text.

The application should instead create a concise structured
representation.

Example:

``` json
{
  "type": "food",
  "intent": "eat",
  "name": "Ke Kou Mian",
  "location": "Orchard Towers",
  "why_saved": "Restaurant the user wants to try",
  "useful_details": [
    "Open 24/7",
    "Combo available",
    "Original $8.90",
    "Spicy $9.90"
  ]
}
```

The original screenshot remains available for reference.

------------------------------------------------------------------------

# 5. Core Concept: "Things", Not "Screenshots"

Internally, the application may store screenshots.

But the user-facing mental model should be:

> **Saved things**

rather than:

> **Screenshot files**

A screenshot is simply the source material from which the application
creates a useful "thing".

Examples:

### Food

``` text
🍜 Ke Kou Mian
Orchard Towers

Open 24/7

Try:
- Combo
- Original
- Spicy
```

### Place

``` text
📍 Mountain / attraction
Japan

Want to visit someday
Best season: Autumn
```

### Product

``` text
🛒 Product name
$XXX

Consider buying
```

### Experience

``` text
🎟 Event / activity

Want to experience someday
```

------------------------------------------------------------------------

# 6. Intent

The application should distinguish between **what something is** and
**why the user probably saved it**.

Possible intents:

-   `eat`
-   `visit`
-   `buy`
-   `experience`
-   `learn`
-   `reference`
-   `other`

Examples:

  Screenshot                  Type          Intent
  --------------------------- ------------- ------------
  Restaurant recommendation   Food          Eat
  Hiking trail                Place         Visit
  Product listing             Product       Buy
  Concert poster              Event         Experience
  Tutorial                    Information   Learn
  Useful reference image      Information   Reference

The intent should be automatically suggested and remain editable.

------------------------------------------------------------------------

# 7. AI Strategy

## 7.1 AI is useful, but should not control the whole application

The first version should not send every screenshot to an expensive
external AI service by default.

The preferred pipeline is:

``` text
Screenshot
    ↓
Local OCR
    ↓
Basic extraction / rules
    ↓
Can enough information be understood?
    ├── Yes → save structured result
    └── No  → optional AI processing
```

This keeps the application:

-   Cheap
-   Private
-   Fast
-   Local-first

## 7.2 Why AI is useful

Simple keyword rules can detect:

> "restaurant", "ramen", "\$12", "Orchard"

but may struggle to understand:

> "This is an Instagram recommendation for a restaurant the user
> probably wants to visit."

AI can potentially infer:

-   What the screenshot represents
-   The likely name
-   Location
-   Important details
-   Likely user intent
-   Why the screenshot was probably saved

## 7.3 AI should produce structured information

Avoid asking AI for large prose summaries.

Prefer structured output such as:

``` json
{
  "type": "food",
  "intent": "eat",
  "name": "Ke Kou Mian",
  "location": "Orchard Towers",
  "why_saved": "Restaurant to try",
  "useful_details": [
    "Open 24/7",
    "Original $8.90",
    "Spicy $9.90"
  ],
  "confidence": 0.91
}
```

This makes AI easier to replace, test, and control.

------------------------------------------------------------------------

# 8. OCR

OCR is a core feature.

Potential local implementation:

-   Apple Vision framework
-   Other local OCR implementation if technically easier

The OCR layer should:

1.  Extract text from screenshots
2.  Store the extracted text
3.  Make it searchable
4.  Provide text to later categorisation/AI processing

The application should prefer local OCR over an external OCR API.

------------------------------------------------------------------------

# 9. Home Screen

The home screen should focus on reducing overwhelm.

Instead of showing a giant screenshot grid immediately, it should
communicate the user's collection in terms of things they care about.

Example:

``` text
                 SOMEDAY

        Things you've saved for later


        🍜 EAT
        32 places

        📍 VISIT
        24 places

        🛒 BUY
        18 things

        🎟 EXPERIENCE
        11 things

        📚 LEARN
         9 things

        💡 OTHER
        43 things
```

The exact UI is not fixed.

The important principle is:

> **The home screen should feel like a calm personal collection, not a
> task backlog.**

------------------------------------------------------------------------

# 10. Discovery / Revisit

A major feature should be helping the user rediscover saved things
without requiring them to review everything.

Example:

``` text
Things you saved recently

┌──────────────────────────────┐
│ 🍜 Ke Kou Mian              │
│ Orchard Towers               │
│                              │
│ Saved because you wanted     │
│ to try this restaurant.      │
│                              │
│ [ View ] [ Maybe later ]     │
└──────────────────────────────┘
```

Another possible mode:

> **Show me something**

The application selects a small number of saved things rather than
presenting the entire backlog.

This is intended to make revisiting enjoyable and manageable.

------------------------------------------------------------------------

# 11. Review / Triage

The application may provide a lightweight review mode.

Example:

``` text
┌──────────────────────────────┐
│                              │
│          ORIGINAL            │
│          SCREENSHOT          │
│                              │
└──────────────────────────────┘

🍜 Ke Kou Mian
Orchard Towers

Open 24/7
$8.90–$9.90

[ Keep ] [ Maybe ] [ Done ]
```

The user should be able to move quickly through items.

Important:

**Review mode is not intended to force the user to process the entire
collection.**

It is a tool for gradually reducing uncertainty and rediscovering saved
items.

------------------------------------------------------------------------

# 12. Search

Search should be one of the strongest features.

Search should cover:

-   OCR text
-   Name
-   Location
-   Intent
-   Type
-   Useful details
-   Filename

Example:

``` text
Search: ramen
```

Could find screenshots containing:

-   Ramen Nagi
-   Ke Kou Mian
-   Japanese noodles
-   "best ramen in Singapore"

even if the user never manually tagged them.

------------------------------------------------------------------------

# 13. Filtering

Possible filters:

-   Eat
-   Visit
-   Buy
-   Experience
-   Learn
-   Reference
-   Other

And potentially:

-   Recently added
-   Oldest
-   Recently revisited
-   Uncertain / low confidence
-   Location
-   Category/type

Filters should remain lightweight.

------------------------------------------------------------------------

# 14. Original Screenshot

When importing:

``` text
Original screenshot
       │
       ├── remains untouched
       │
       └── copied into Someday
```

The application must never automatically modify or delete the original
screenshot.

The user will manually remove originals from Photos when satisfied that
they have been safely imported.

------------------------------------------------------------------------

# 15. Storage

Initial storage should be simple.

Possible structure:

``` text
someday/
├── data/
│   ├── items.json
│   └── settings.json
│
├── images/
│   ├── abc123.png
│   ├── def456.png
│   └── ...
│
└── app/
```

A conventional database is not required for V1.

JSON should be sufficient for the expected collection size.

If the collection grows substantially later, the storage layer can be
replaced without changing the conceptual data model.

------------------------------------------------------------------------

# 16. Example Data Model

``` json
{
  "id": "abc123",
  "image_path": "images/abc123.png",
  "original_filename": "IMG_1234.PNG",

  "type": "food",
  "intent": "eat",

  "name": "Ke Kou Mian",
  "location": "Orchard Towers",

  "why_saved": "Restaurant to try",

  "useful_details": [
    "Open 24/7",
    "Original $8.90",
    "Spicy $9.90"
  ],

  "extracted_text": "...",

  "confidence": 0.91,

  "created_at": "2026-10-08T10:00:00",
  "updated_at": "2026-10-08T10:00:00"
}
```

This schema is intentionally flexible.

------------------------------------------------------------------------

# 17. Import Flow

The user should be able to:

-   Select one screenshot
-   Select multiple screenshots
-   Drag and drop screenshots

Example:

``` text
[ + Add Screenshots ]

        ↓

37 screenshots selected

        ↓

Importing...

37 / 37

✓ Copied
✓ OCR
✓ Analysed
✓ Added
```

The user should not have to manually process each image.

------------------------------------------------------------------------

# 18. Duplicate Detection

Duplicate detection is a useful non-AI feature.

When importing:

``` text
New image
    ↓
Image hash
    ↓
Already imported?
   /       \
 Yes       No
 ↓          ↓
Duplicate   Import
```

This can prevent repeated screenshots from cluttering the library.

------------------------------------------------------------------------

# 19. Deletion

There are two different concepts.

## Original

The screenshot in Photos or its original location.

**Never automatically deleted.**

## Someday copy

The local copy managed by the application.

Can be deleted by the user from the application.

For V1:

``` text
Delete from Someday
        ↓
Delete Someday copy
        ↓
Original remains untouched
```

------------------------------------------------------------------------

# 20. Privacy

The application is intended to be local-first.

Default behaviour:

-   Images stored locally
-   OCR performed locally where practical
-   Metadata stored locally
-   No account
-   No cloud database
-   No automatic upload

If optional AI is introduced, the user should be clearly informed that a
screenshot is being sent to an external service.

AI processing should ideally be:

-   Optional
-   Explicitly configurable
-   Limited to screenshots where it provides value

------------------------------------------------------------------------

# 21. V1 Scope

## Must Have

-   [ ] Local web application
-   [ ] Mac support
-   [ ] Import multiple screenshots
-   [ ] Copy screenshots into local storage
-   [ ] Local OCR
-   [ ] Store OCR text
-   [ ] Basic automatic extraction
-   [ ] Basic type/category detection
-   [ ] Intent detection
-   [ ] Structured item representation
-   [ ] Visual library
-   [ ] Search
-   [ ] Filtering
-   [ ] Item detail view
-   [ ] Manual editing of generated information
-   [ ] Manual deletion of Someday copies
-   [ ] JSON storage

## Should Have

-   [ ] Drag and drop
-   [ ] Duplicate detection
-   [ ] Review mode
-   [ ] "Show me something" discovery mode
-   [ ] Confidence indicator for automatic interpretation
-   [ ] Re-process item
-   [ ] Bulk import progress

## Could Have

-   [ ] Optional AI processing for ambiguous screenshots
-   [ ] AI-generated "why saved" description
-   [ ] Better location extraction
-   [ ] Better entity extraction
-   [ ] Recently revisited
-   [ ] Lightweight reminders

## Not V1

-   [ ] iPhone app
-   [ ] iCloud sync
-   [ ] Multi-user support
-   [ ] Cloud database
-   [ ] Automatic Photos deletion
-   [ ] Complex tagging system
-   [ ] User-written notes
-   [ ] Social features
-   [ ] Recommendation engine
-   [ ] Full photo management
-   [ ] Mandatory external AI API

------------------------------------------------------------------------

# 22. Technical Direction

The implementation should favour a simple stack.

A possible architecture:

``` text
┌──────────────────────────────┐
│          Browser             │
│       Local Web UI           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Local Backend          │
│                              │
│  Import                      │
│  OCR                         │
│  Processing                  │
│  Search                      │
│  Metadata                    │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ JSON data   │  │ Local images │
└─────────────┘  └──────────────┘
```

The exact framework is deliberately undecided until implementation
begins.

------------------------------------------------------------------------

# 23. Development Strategy

Build in layers.

## Phase 1 --- Basic library

``` text
Import
→ Copy
→ Display
→ Delete
```

## Phase 2 --- OCR

``` text
Import
→ OCR
→ Search
```

## Phase 3 --- Structured understanding

``` text
OCR
→ Type
→ Intent
→ Name
→ Location
→ Useful details
```

## Phase 4 --- Better UX

``` text
Home
→ Someday overview
→ Discovery
→ Review
→ Search
```

## Phase 5 --- Optional AI

Only after real usage demonstrates that local processing is
insufficient.

------------------------------------------------------------------------

# 24. Success Criteria

The project is successful if the user can take a messy collection of
100+ screenshots and feel:

> **"I don't need to remember what I saved or dig through Photos
> anymore. I can just open Someday and understand what I have saved for
> later."**

More specifically:

1.  Import 100+ screenshots without manually processing each one.
2.  Automatically extract useful information.
3.  Quickly understand what each screenshot represents.
4.  Search for old saved things without remembering the original
    screenshot.
5.  Browse things by intent such as Eat, Visit, Buy, or Experience.
6.  Revisit saved things without feeling like there is a huge backlog.
7.  Preserve the original screenshots until the user manually decides to
    delete them.
8.  Keep the system simple and local.

------------------------------------------------------------------------

# 25. Guiding Product Statement

> **Someday is not a screenshot organiser.**
>
> **It is a calm personal inbox for all the things you told yourself
> you'd do someday.**

The screenshots are merely how those intentions enter the system.

The application's job is to turn:

``` text
"I remember saving something about this..."
```

into:

``` text
"Oh, right. THIS is the place I wanted to try."
```

without making the user feel like they have another pile of work to
clear.
