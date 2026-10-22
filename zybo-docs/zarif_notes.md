# 📝 Zarif's Edit Plan — Docs Site Revisions

A running to-do list of changes planned for the ZYBO Lorenz docs site. Organized by page/section so it's easy to tackle one at a time.

---

## 🏠 Overview & Contents Section

- [ ] **Bi-directional arrow** into `lorenz_dda_driver` on the PL side — shows it has both inputs *and* outputs (currently one-directional)
- [ ] **Remove the "Scope" section**
- [ ] **Add an "Acknowledgments" section** instead, covering:
  - Our experience working through the project
  - What used to be the "Scope" content
- [ ] **Replace the written "Result" section** with an embedded **YouTube video** of the Lorenz system running live

> [!NOTE]
> 🎥 **Self-reminder:** Record and post the demo video to YouTube before this section can be finished.

---

## 🏗️ 01 — Architecture Page

- [ ] Convert long descriptive sentences into **bullet points** — especially the explanation of the original Digilent demo
- [ ] Break the **PL and PS** description into bullet points too, for consistency

### ❓ Open Question
- [ ] **"What I changed and why"** section — still undecided on how to structure this. Revisit later.

### 🧮 Lorenz Core (Section 4)
- [ ] Typeset the Lorenz equations in **LaTeX** so they render as proper mathematical formulas instead of plain text

---

## 🧰 01 — Environment & Prerequisites

- [ ] Reframe the tools/board/cable list as a **"What do we need?"**-style intro instead of a plain requirements list

### 🚚 Content to Relocate
- [ ] Move the **ASCII-only computer name** issue out of this page → into **Gotchas** or **Issues** instead
  - Rationale: it's a rare problem, mostly affects students working on their own personal laptop

### 🖼️ Visuals Needed
- [ ] **Repository layout** — replace the text description with an actual **screenshot of the folder tree**

> [!NOTE]
> 📸 **Self-reminder:** Grab a screenshot of the repo folder tree soon.

### 🔀 Merge Candidate
- [ ] Some steps in this section should eventually be **merged with my own personal instructions**, which have far more screenshots to follow — deferred for now.

---

## 🔧 03 — The Lorenz IP

- [ ] Make **"set the number of registers to 7"** stand out — currently easy to miss, should be **bold text**
- [ ] Revisit **03.1 "Create IP skeleton..."** and convert the AXI settings/specifications into more **bullet points** for clarity
- [ ] **Missing section:** there's currently no walkthrough showing how to **import the files into the project** — needs to be added

---

## 🐛🔴 Bugs / Needs Investigation

> [!WARNING]
> ### 🔴 VERY IMPORTANT BUG — AXI4 IP Design Sources Not Auto-Populating
>
> On the **Windows workstation**, when creating a new **AXI4 IP**, the **Design Sources** don't get auto-populated with the AXI FSM boilerplate.
>
> - Expected: files like `{ip_name}.v` and `{ip_name}_slave_lite_v1_0_S00_AXI.v` should show up automatically after IP creation
> - Actual: they don't appear — unclear if they're being generated somewhere else instead, or not generated at all
> - **Action item:** need to figure out *why* this isn't auto-populating (not fixing/investigating in the notes right now — just flagging to dig into later)
>
> **✅ Investigation findings (checked `C:\Users\zk67\Documents\Lorenz`):**
> - The packaged IP itself is fine — `lorenz.v` and `lorenz_slave_lite_v1_0_S00_AXI.v` exist under `ip_repo\lorenz_1_0\hdl\`, and `component.xml` correctly lists both, so the IP instantiates/synthesizes fine in the block design.
> - The problem is specific to the **`edit_lorenz_v1_0.xpr`** side-project Vivado creates for editing the IP's RTL: its `sources_1` fileset has **zero `<File>` entries**, and the `edit_lorenz_v1_0.srcs` folder doesn't exist on disk at all — so Design Sources has nothing to show, even though the files physically exist.
> - Timestamps show `edit_lorenz_v1_0.xpr` and all of `lorenz_1_0`'s subfolders were written in the same minute — consistent with the Package IP wizard finishing, but the step that imports those files into the edit project's own sources view never completing.
> - **Likely fix:** don't open `edit_lorenz_v1_0.xpr` directly — instead right-click the IP instance in the parent project → **"Edit in IP Packager"**, or reopen the **File Groups** page in the Package IP window, to force Vivado to re-link the hdl files into the edit project.
>
> **✏️ Workaround (editing without waiting on the relink):**
> - The `.v` files are just plain text on disk (`ip_repo\lorenz_1_0\hdl\*.v`) — they can be edited directly in any text editor regardless of whether Vivado's Design Sources tree shows them.
> - To get Vivado's edit project working properly: from the **parent project**, use `Tools → Create and Package New IP → "Edit an existing packaged IP"` (browse to `ip_repo\lorenz_1_0`) instead of opening `edit_lorenz_v1_0.xpr` directly — this re-triggers the source scan.
> - If Design Sources is still empty, use the Package IP window's **File Groups** page → refresh/rescan icon to force re-merge of `hdl/*.v`.
> - After editing (either way), use **Re-Package IP** on the Review and Package page to update `component.xml`, then in the parent project right-click the IP instance → **Upgrade IP / Refresh IP** before re-synthesizing.

---

## 🎨 Minor Aesthetic Changes

- [ ] Add a **Light / Dark mode toggle**
- [ ] Make instructions **scale properly to the page** for easier reading (responsive layout pass)

---

## 💭 Personal Reminders / Parked Ideas

> [!IMPORTANT]
> 📚 **Recall ECE 5760 lab steps** — specifically what the checkoff requirements were, and how they were structured.

> [!IMPORTANT]
> 🧪 **Still need a way to test Verilog code** — no testing workflow defined yet.

### 🚀 Future Checkoff Ideas
- [ ] Require the **final demo to run from an SD card alone**, with students demonstrating the *actual boot process* of their own bitstream
  - Goal: prevent students from simply borrowing another student's already-flashed SD card
- [ ] **At the end of the semester, make all Lorenz code private** so future students can't simply copy it
