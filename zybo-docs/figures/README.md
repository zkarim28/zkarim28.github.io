# Figures

Drop screenshots here; pages reference them by name. If the file exists it is shown; if it does not, the page shows either a placeholder box or a short text description.

## Naming convention

- `.png` or `.jpg` both work (also `.jpeg`, `.webp`); all lowercase, words separated by `-`.
- Build-log figures: `step-<slug>.png` (for example `step-bd-address-editor.png`).
- Issue figures: `issue-<slug>.png` (for example `issue-ip-upgrade-report.png`).
- A `<name>-web.jpg` copy, if present, is used instead of `<name>.jpg` (keep large photos small: 2000 px wide is plenty). The 41 MB `step-board-cabling.jpg` original is kept; the page uses `step-board-cabling-web.jpg`.
- Names describe the content, not the page, so one file is used in every page that references it.

## Videos

- Videos are `.mp4` (H.264 + AAC), named `walkthrough-<slug>-web.mp4` for the compressed copy the pages embed.
- GitHub rejects files over 100 MB, so raw screen recordings stay local (`*.mp4` is gitignored here except `*-web.mp4`). Make the web copy with:
  `ffmpeg -i "<raw>.mp4" -c:v libx264 -preset slow -crf 28 -maxrate 700k -bufsize 1400k -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart walkthrough-<slug>-web.mp4`

| File | Source | Caption | Used on |
|---|---|---|---|
| `walkthrough-tool-flow-web.mp4` | `Screen Recording 2026-09-29 150230.mp4` (899 MB, local only) | Project flow through the tool interfaces (13 min 30 s) | index.html, full:index.html |

## Status

| Expected name | Status | Caption | Used on |
|---|---|---|---|
| `issue-bd-41-758` | missing (placeholder shown) | Validate Design error BD 41-758 | full:02-build-log/03-attempt2-fresh-start.html, full:issues.html |
| `issue-data-abort` | missing (placeholder shown) | Vitis Debug view parked in Xil_DataAbortHandler | full:02-build-log/03-attempt2-fresh-start.html, full:issues.html |
| `issue-inbb3` | missing (placeholder shown) | DRC INBB-3 black-box message | full:02-build-log/03-attempt2-fresh-start.html, full:issues.html |
| `issue-ip-upgrade-report` | present (`issue-ip-upgrade-report.png`) | ip_upgrade.log: upgraded port widths 7 differ from original width 5 | 02-build-log/04-block-design.html, issues.html |
| `issue-makefile-error` | text only | Platform build log with the (ildcard error | 02-build-log/06-vitis-platform.html, issues.html |
| `issue-no-signal` | missing (placeholder shown) | Monitor showing 'no signal' (attempt 1) | full:02-build-log/02-attempt1-simplified.html, full:issues.html |
| `issue-path-length` | missing (placeholder shown) | The 17-680 message | full:issues.html |
| `issue-spawn-failed` | missing (placeholder shown) | Vivado messages with the repeated Spawn failed error | full:issues.html |
| `issue-xsct-mrd` | missing (placeholder shown) | XSCT mrd fault at 0x43C30000 | full:02-build-log/03-attempt2-fresh-start.html, full:issues.html |
| `step-baseline-block-design` | present (`step-baseline-block-design.png`) | Stock design_1 block design before adding the Lorenz IP | 02-build-log/02-baseline.html |
| `step-baseline-vitis-explorer` | present (`step-baseline-vitis-explorer.png`) | Folder ivan_lorenz_hdmi after extracting the archives: Vitis platform, app and system project, plus the Vivado project Zybo-Z7-HW | 02-build-log/02-baseline.html |
| `step-baseline-vivado-open` | text only | Zybo-Z7-HW opened in Vivado — stock block design | 02-build-log/02-baseline.html |
| `step-bd-address-editor` | present (`step-bd-address-editor.png`) | Address Editor showing 0x43C30000 / 64K for lorenz_dda_driver_0 | 02-build-log/04-block-design.html |
| `step-bd-lorenz-connections` | present (`step-bd-lorenz-connections.png`) | lorenz_dda_driver_0 on axi_interconnect_gp0/M05_AXI, clock and reset connected (highlighted in orange) | 02-build-log/04-block-design.html |
| `step-bd-validate-ok` | present (`step-bd-validate-ok.png`) | Validate Design: 'Validation successful' | 02-build-log/04-block-design.html |
| `step-board-cabling` | present (`step-board-cabling-web.jpg`) | Zybo Z7-10: PROG/UART micro-USB, HDMI cable in the TX connector, 5 V wall-plug barrel supply, boot jumper JP5 | 02-build-log/01-environment.html |
| `step-display-first-run` | text only | First run: plots cut off by the box edge (before enlarging) | 02-build-log/08-plotter-demo.html, issues.html |
| `step-display-full-screen` | present (`step-display-full-screen.jpg`) | Running display: XY (top-left), YZ (top-right), XZ (bottom-left) and the parameter panel; parameters shown: σ=10, ρ=28, β=2.67, dt=10 | 02-build-log/08-plotter-demo.html |
| `step-display-panel-closeup` | present (`step-display-panel-closeup.jpg`) | Parameter panel: initial values on the left, live X/Y/Z on the right | 02-build-log/08-plotter-demo.html |
| `step-export-hardware-dialog` | present (`step-export-hardware-dialog.png`) | File → Export → Export Hardware… (tick 'Include bitstream' in the dialog that opens) | 02-build-log/05-bitstream-xsa.html |
| `step-ip-block-design` | present (`step-ip-block-design.png`) | Whole design_1 with lorenz_dda_driver_0 added (highlighted) | 02-build-log/04-block-design.html |
| `step-ip-first-edit-window-add-ip-repository` | present (`step-ip-first-edit-window-add-ip-repository.png`) | Settings → IP → Repository: list is empty; + opens the folder browser (IP's own folder selected) | 02-build-log/03-custom-ip.html |
| `step-ip-first-edit-window-include-new-ip-folder` | present (`step-ip-first-edit-window-include-new-ip-folder.png`) | After Select → OK: '1 repository was added to the project', IPs (1) found | 02-build-log/03-custom-ip.html |
| `step-ip-first-edit-window-lookup-new-ip-in-catalog` | present (`step-ip-first-edit-window-lookup-new-ip-in-catalog.png`) | IP Catalog, searched by name: the IP now appears under User Repository → AXI Peripheral | 02-build-log/03-custom-ip.html |
| `step-ip-first-edit-window-open-second-edit-window-in-catalog` | present (`step-ip-first-edit-window-open-second-edit-window-in-catalog.png`) | Right-click the IP in the catalog → Edit in IP Packager | 02-build-log/03-custom-ip.html |
| `step-ip-first-edit-window-setting` | present (`step-ip-first-edit-window-setting.png`) | First editor window: Tools → Settings, about to open IP → Repository | 02-build-log/03-custom-ip.html |
| `step-ip-open-first-edit-window` | present (`step-ip-open-first-edit-window.png`) | Wizard's Peripheral Generation Summary page: 'Edit IP' selected, click Finish | 02-build-log/03-custom-ip.html |
| `step-ip-packager-summary` | present (`step-ip-packager-summary.png`) | IP Packager, Review and Package, running from the short-path project d:/xilinx/temp/lorenz_dda_driver_v1_0_project3 | 02-build-log/01-environment.html, 02-build-log/03-custom-ip.html |
| `step-ip-second-edit-window-repackage-ip-page` | present (`step-ip-second-edit-window-repackage-ip-page.png`) | Package IP, Review and Package: Re-Package IP applies the edits | 02-build-log/03-custom-ip.html |
| `step-ip-second-edit-window-view` | present (`step-ip-second-edit-window-view.png`) | Second editor window: Sources now lists the IP's real .v files; Package IP tab open | 02-build-log/03-custom-ip.html |
| `step-ip-upgrade-report` | text only | Report IP Status showing lorenz_dda_driver_0 needing upgrade | 02-build-log/04-block-design.html |
| `step-repo-ip-settings` | present (`step-repo-ip-settings.png`) | Project Settings → IP → Repository listing ip_repo/lorenz_dda_driver_1_0 | 02-build-log/04-block-design.html |
| `step-sd-boot-running` | present (`step-sd-boot-running.jpg`) | Boot-mode jumper JP5 on the SD position | 02-build-log/09-run-sd-boot.html |
| `step-uart-menu` | present (`step-uart-menu.png`) | PuTTY on COM6: key menu, then +, -, p, i and an 's' parameter session | 02-build-log/08-plotter-demo.html, issues.html |
| `step-uart-register-readback` | text only | UART/debugger read-back of the parameter registers (optional) | 02-build-log/07-ps-driver.html |
| `step-vitis-app-tree` | present (`step-vitis-app-tree.png`) | Vitis Explorer: Zybo-Z7-10-HDMI/src with lorenz_dda/ | 02-build-log/07-ps-driver.html |
| `step-vitis-build-project` | present (`step-vitis-build-project.png`) | Right-click the app project → Build Project | 02-build-log/09-run-sd-boot.html |
| `step-vitis-create-boot-image` | present (`step-vitis-create-boot-image.png`) | Right-click Zybo-Z7-10-HDMI_system → Create Boot Image (console: the system-project build running bootgen) | 02-build-log/09-run-sd-boot.html, issues.html |
| `step-vitis-launch-hardware` | present (`step-vitis-launch-hardware.png`) | Run As → Launch Hardware (Single Application Debug); the console shows the finished build | 02-build-log/09-run-sd-boot.html |
| `step-vitis-program-device` | text only | Program Device dialog | 02-build-log/09-run-sd-boot.html |
| `step-vitis-update-platform` | present (`step-vitis-update-platform.png`) | Assistant view: right-click design_1_wrapper [Platform] → Update Hardware Specification (Build and Clean are in the same menu) | 02-build-log/06-vitis-platform.html |
| `step-vitis-xparameters-lorenz` | text only | xparameters.h with the LORENZ macro | 02-build-log/06-vitis-platform.html, issues.html |
| `step-vivado-bitstream-done` | present (`step-vivado-bitstream-done.png`) | Vivado: write_bitstream Complete | 02-build-log/05-bitstream-xsa.html |
| `step-vivado-create-axi-ip` | present (`step-vivado-create-axi-ip.png`) | Create and Package New IP: 'Create a new AXI4 peripheral' | 02-build-log/03-custom-ip.html |
| `step-vivado-create-ip` | present (`step-vivado-create-ip.png`) | Vivado: Tools → Create and Package New IP… | 02-build-log/03-custom-ip.html |
| `step-vivado-ip-reg-set` | present (`step-vivado-ip-reg-set.png`) | Add Interfaces: S00_AXI, Lite, Slave, 32 bit, Number of Registers (set to 7 for the real IP) | 02-build-log/03-custom-ip.html |
| `step-vivado-timing-summary` | text only | Timing summary: all constraints met | 02-build-log/05-bitstream-xsa.html |
