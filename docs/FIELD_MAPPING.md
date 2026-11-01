# Field mapping guide

Your real Google Sheet is confidential and its structure is unknown to this tool, so nothing is hard-coded.
In step 2 of the app you map **your** column names to these logical fields.

| Logical field | Required? | What it is | Notes |
|---|---|---|---|
| `channel` | **Yes** | Which monitoring channel the row belongs to | You then tick which values mean Private Messages / Public Comments / Seeded Posts / Seeded Replies |
| `inquiry_theme` (Category) | **Yes** | Categorised customer concern | Grouped case-insensitively ("LOGIN" = "Login"); blank → "(Uncategorized)" + warning |
| `actual_message` (Message) | For quote tables | Customer message / comment / seeded post text. **Seeded replies: the original post** | Missing → "—" in the table + warning |
| `actual_response` / `seeded_reply` (Response) | For quote tables | Reply actually sent. **Seeded replies: the seeded reply** | Not used for Seeded Posts |
| `report_start/end_date` (Date) | Optional | Date of each interaction | Needed for the period filter, previous-period trends and "peak day" |
| `interaction_count` (Count) | Optional | Interactions the row represents | Default 1 per row. Missing/invalid → 1 + warning |
| `post_count`, `reply_count` | Calculated | Number of rows (or sum of Count) per theme in the Seeded channels | |
| `observation`, `recommended_action` | Human | Interpretation and proposals | Pre-filled with facts; `[[placeholders]]` mark what you must write |

## What is calculated vs. human-written
* **Calculated (never typed):** channel totals (the 4 KPIs), total touchpoints, customer-initiated (PM + PC) vs proactive (SP + SR), top themes and ranking, % share (denominator = that channel's total), pie slices (top 8 + "Others"), previous-period comparison.
* **Selected from your data:** the quote shown for each theme (most recent example that fits and has both message and response). Use **↻ another example** to switch to a different real one. Quotes are never invented; very long ones are shortened with "…" and flagged.
* **Human interpretation:** implications, recommended actions, notable concerns, opportunities, the final summary.

## Metric definitions
| Metric | Definition |
|---|---|
| Channel total | Sum of Count (or number of rows) for rows mapped to that channel within the period |
| Total touchpoints | PM + PC + SP + SR (each row belongs to exactly one channel → no double counting) |
| Customer-initiated | PM + PC · Proactive = SP + SR |
| Theme share | theme count ÷ **that channel's** total |
| Period change | Only shown if the previous period contains data; otherwise the report says no comparison is available |

## Several tabs?
Combine them into one tab before export: stack rows with the same columns and add a `Channel` column (e.g. via `={'PM'!A2:E; 'Comments'!A2:E}` plus a helper column, or copy/paste). If a tab already represents one channel, you can create a constant Channel column (`Private Message`) for it. Avoid copying the same interaction into two tabs (double counting).

## Missing or inconsistent values
* Spelling/casing variants of a theme are merged by case/whitespace only — fix real spelling differences in the sheet (e.g. "Log-in" vs "Login").
* Rows with an unassigned channel value are ignored and counted in the warnings.
* Rows with unreadable dates are excluded when a period is set.
