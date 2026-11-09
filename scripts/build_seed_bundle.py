#!/usr/bin/env python3
"""
Builds seed-bundle.json for the GitHub Pages (github.io) + Vercel gamified fork.
Embeds the White Paper, Master Book, Portal Machine Story Maps 12-Section Blueprint,
all /seed/00-29 files, VC tools, and Data Room rooms into one JSON bundle.
"""

import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from apps.studio.blueprint_studio import StudioBlueprintApp, markdown_to_rich_html
from apps.vc_directory.server import VCDirectoryApp
from apps.dataroom.server import ROOMS_SEED

PORTAL_MACHINE_MD = """# Portal Machine Story Maps — Business & Web App Blueprint

**Prepared for:** Kendren "KJ" Cornish | **Brand Example:** Kindred's Waitlist × Robotic Discipline × Animal Scrypt | **Version:** v1.0

> **The Core Idea:** Turn a simple link-in-bio page into a stationary app home screen where every icon opens a living portal-machine world. Each world guides users through a visual chain reaction, pauses at strategic offers, then drives them into a final conversion.

---

## 1. Executive Summary
Portal Machine Story Maps combines a link-tree, a cinematic landing page, and an interactive illustrated funnel. Instead of showing a list of static links, the visitor enters a stationary home screen of branded applications. Each application opens into its own living world: a kinetic, hand-drawn story map where each movement causes the next action.

**Cause-and-effect UX path:**
`Select App -> Start (Pull Lever) -> Pause at Stop 1..4 (Click External Link or Continue Journey) -> Stop 5: Final Portal Conversion`

---

## 2. Core Language and Positioning

| Term | Meaning | Use in the Product |
|---|---|---|
| **Portal Machine Story Map** | A branded illustrated page that behaves like a living machine. | Each app opens one story map. |
| **Kinetic Narrative Architecture** | Rooms, paths, triggers, and scenes arranged to create a story-driven user journey. | The design language behind every world. |
| **Domino System Illustration** | A visible chain reaction where one motion causes the next. | The interaction logic of the funnel. |
| **Causeway World** | A themed living world created for one business, creator, project, or campaign. | The sellable unit or template. |
| **Living App** | An icon on the main home screen that expands into a world. | The user-facing entry point. |
| **Final Portal** | The final conversion chamber after the user passes through the stops. | Waitlist, booking, purchase, newsletter, or application. |

---

## 3. Product Model (Two Layers)
1. **Stationary Home Screen:** Feels like a clean computer desktop on desktop and a phone home screen on mobile. Displays 6 configurable Living App icons (`Dating / Social Portal`, `Portfolio Gallery`, `Company Lab`, `Research Observatory`, `Kindred's Waitlist`, and `Robotic Discipline School`).
2. **Animated Living Worlds:** One reusable JSON-driven engine powers every living app world while carrying a different brand, visual theme, set of stops, and final conversion goal.

---

## 4. UX Mechanics: The Chain Reaction Funnel

| Step | What Happens Visually | What Happens Strategically |
|---|---|---|
| **1. Start** | Visitor clicks `Enter the World` or an app icon. A lever, gear, marble, bridge, or portal activates. | Hooks attention and turns passive browsing into participation. |
| **2. Movement** | Camera pans or the path animates to the first room. | Creates curiosity and lowers bounce rate. |
| **3. Pause Stop** | Animation pauses at a room with a label, short pitch, primary CTA button, and `Continue Journey` button. | Gives the visitor a choice: click link or continue. |
| **4. Repeat** | The next cause-and-effect action opens the next room. | Builds story momentum without overwhelming the visitor. |
| **5. Final Portal** | A glowing portal, door, elevator, tunnel, or launch chamber opens. | Focuses all attention on the main conversion. |

---

## 5. Living World Templates & Client Use Cases

| Template | Example Stops | Final Goal |
|---|---|---|
| **Kindred's Waitlist** | Social Portal, Portfolio Gallery, Company Lab, Research Observatory | Join the waitlist or early access list. |
| **Entrepreneur Portfolio** | Origin Story, Work Samples, Offers, Case Studies | Book a call, download media kit, or contact. |
| **Restaurant Portal** | Menu Room, Reservation Desk, Delivery Dock, Chatbot Kitchen | Order, reserve, join loyalty list, or contact. |
| **Creator Link Hub** | Videos, Shop, Newsletter, Community, Events | Subscribe, buy, join community, or follow. |
| **Research Archive** | Papers, Notes, Experiments, Tools, Resource Library | Enter archive, subscribe, or request access. |
| **Real Estate / Local Services** | Listings, Services, Testimonials, Booking Desk | Lead form, tour request, quote request, or call. |

---

## 6. Example World: Kindred's Waitlist (5 Stops)

| Stop | Label | Destination Link | Primary CTA Copy |
|---|---|---|---|
| **1** | **Social Portal** | `#dating-link` | Enter the social experiment |
| **2** | **Portfolio Gallery** | `#portfolio-link` | View the creative archive |
| **3** | **Company Lab** | `#company-link` | Explore the systems being built |
| **4** | **Research Observatory** | `#research-link` | Open the research notes |
| **5** | **Final Waitlist Portal** | `#waitlist-link` | Join Kindred's Waitlist |

---

## 7. Web App Architecture & Data Model
* **Visual World Layer:** Illustration, rooms, portals, animated path.
* **Interaction Layer:** Start button, pauses, continue buttons, clickable stops.
* **Content Layer:** Labels, descriptions, CTAs, link destinations, offer copy.
* **Automation Layer:** Waitlist capture, CRM, email, scheduling, chatbot, analytics.
* **Tracked Analytics Events:** `app_opened`, `start_clicked`, `stop_viewed`, `primary_link_clicked`, `continue_clicked`, `final_cta_clicked`, `waitlist_submitted`.

---

## 8. MVP Scope & Offer Ladder
* **Starter Tier:** Interactive link hub with 4 stops and 1 final CTA.
* **Growth Tier:** Custom art direction, analytics, email capture, and 2–3 app worlds.
* **Premium Tier:** Full home screen system with multiple living apps, custom automation, and monthly optimization.
"""


def main() -> None:
    studio = StudioBlueprintApp(db_path=":memory:")
    vc_dir = VCDirectoryApp()

    docs = {}
    titles = []
    titles.append(("PORTAL_MACHINE_BLUEPRINT", "★ Portal Machine Story Maps — 12-Section Blueprint"))
    docs["PORTAL_MACHINE_BLUEPRINT"] = {
        "title": "★ Portal Machine Story Maps — 12-Section Blueprint",
        "markdown": PORTAL_MACHINE_MD,
        "html": markdown_to_rich_html(PORTAL_MACHINE_MD),
    }

    for doc_id, label in studio.list_available_docs():
        md = studio.load_doc_markdown(doc_id)
        titles.append((doc_id, label))
        docs[doc_id] = {
            "title": label,
            "markdown": md,
            "html": markdown_to_rich_html(md),
        }

    bundle = {
        "generated_at": "2026-11-08T22:45:00Z",
        "doc_index": titles,
        "documents": docs,
        "vc_tools": vc_dir.load_tools(),
        "dataroom_rooms": ROOMS_SEED,
        "portable_identity": json.loads((REPO_ROOT / "skeleton" / "portable_identity_export.json").read_text(encoding="utf-8")),
    }
    out_path = REPO_ROOT / "seed-bundle.json"
    out_path.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(docs)} documents, {len(bundle['vc_tools'])} VC tools)")


if __name__ == "__main__":
    main()
