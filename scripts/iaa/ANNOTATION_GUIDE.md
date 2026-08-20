# Annotation Guide — Inter-Annotator Agreement Validation

This guide is for the second annotator validating gold-standard labels
for Experiments 3 and 4 of the DocuMind research project.

You will receive two CSV files. Annotate them independently — do not
discuss your labels with the primary annotator until you are finished.

---

## Task A — Citation Verification (Experiment 3)

**File:** `exp3_iaa_sheet.csv` (hide the `annotator1_verdict` column)

For each row you will see:
- `sentence` — a sentence from a DocuMind-generated Business Requirements Document (BRD)
- `snippet_1` (and optionally `snippet_2`, `snippet_3`) — the original
  source text from emails or meeting transcripts that DocuMind cited as evidence

**Your task:** Does the source snippet actually support the BRD sentence?

### SUPPORTS

The source snippet clearly and directly backs up the BRD sentence.
The BRD sentence is a fair summary, restatement, or formalization of what is in the snippet.
**Be generous** — requirements often need to be formalized from informal communications.

**Examples:**

✓ **BRD:** "The system shall provide the last change of hands date for Chelsea Villa."  
**Snippet:** "Can you please provide me with the last change of hands date and price for Chelsea Villa?"  
→ **SUPPORTS** (BRD formalizes the request into a system requirement)

✓ **BRD:** "The system must support email notifications for new assignments."  
**Snippet:** "We need to get email alerts whenever someone assigns us a new task."  
→ **SUPPORTS** (core meaning preserved despite different wording)

✓ **BRD:** "Users can filter properties by price range."  
**Snippet:** "It would be great if we could narrow down the search by setting a min and max price."  
→ **SUPPORTS** (BRD captures the essence of the feature request)

### PARTIALLY

The snippet is related and loosely relevant, but the BRD sentence:
- Makes significant leaps beyond what's stated
- Adds substantial details not in the snippet
- Only partially relates to the source content
- Generalizes too broadly from specific examples

**Examples:**

⚠ **BRD:** "The system shall automatically calculate property valuations using market data."  
**Snippet:** "We should look at recent sales in the area to estimate value."  
→ **PARTIALLY** (snippet suggests manual analysis, BRD implies automation)

⚠ **BRD:** "All users must complete security training before accessing the system."  
**Snippet:** "New hires should go through the security orientation."  
→ **PARTIALLY** (snippet mentions new hires only, BRD extends to all users)

⚠ **BRD:** "The dashboard shall display real-time analytics with sub-second latency."  
**Snippet:** "Can we get a dashboard that shows current stats?"  
→ **PARTIALLY** (BRD adds performance requirements not mentioned in snippet)

### DOES_NOT_SUPPORT

The snippet has nothing to do with the BRD sentence, or the BRD sentence
contradicts, misrepresents, or fabricates information not in the source.

**Examples:**

✗ **BRD:** "The system shall integrate with Salesforce CRM."  
**Snippet:** "We need better customer tracking capabilities."  
→ **DOES_NOT_SUPPORT** (snippet doesn't mention Salesforce specifically)

✗ **BRD:** "Users can export reports in PDF format."  
**Snippet:** "The reporting module needs to be more flexible."  
→ **DOES_NOT_SUPPORT** (snippet is vague, doesn't mention PDF export)

✗ **BRD:** "The mobile app must work offline."  
**Snippet:** "Our field agents need access to the system when they're on site."  
→ **DOES_NOT_SUPPORT** (snippet doesn't specify offline capability)

### Decision Rules

- If the BRD sentence captures the **core intent** of the snippet, even with different wording → **SUPPORTS**
- If the BRD adds **minor clarifications** or standard formalizations → **SUPPORTS**
- If the BRD makes **significant assumptions** or adds **substantial new details** → **PARTIALLY**
- If the snippet is **vague or unrelated** to the specific BRD claim → **DOES_NOT_SUPPORT**
- When uncertain between SUPPORTS and PARTIALLY → prefer **SUPPORTS** (be generous)
- When uncertain between PARTIALLY and DOES_NOT_SUPPORT → prefer **PARTIALLY**

**Fill in `annotator2_verdict` with:** `SUPPORTS`, `PARTIALLY`, or `DOES_NOT_SUPPORT`

---

## Task B — Conflict Detection (Experiment 4)

**File:** `exp4_iaa_sheet.csv` (hide the `annotator1_label` column)

For each row you will see two requirements extracted from software requirements documents:
- `requirement_A` — first requirement statement
- `requirement_B` — second requirement statement

**Your task:** Do these two requirements conflict with each other?

### CONTRADICTION

Two requirements that **cannot both be satisfied simultaneously**.
They make mutually exclusive demands or specify incompatible system behaviors.

**Examples:**

✗ **Req A:** "The system must support Windows operating system only."  
**Req B:** "The system shall be compatible with Linux platforms."  
→ **CONTRADICTION** (cannot be Windows-only AND support Linux)

✗ **Req A:** "All data must be stored locally on the device."  
**Req B:** "The system shall synchronize all data to cloud storage in real-time."  
→ **CONTRADICTION** (local-only storage conflicts with cloud sync)

✗ **Req A:** "Users must authenticate using biometric fingerprint scanning."  
**Req B:** "The system shall not collect or store any biometric data."  
→ **CONTRADICTION** (cannot use fingerprints without collecting biometric data)

✗ **Req A:** "The application must function without internet connectivity."  
**Req B:** "All features require real-time API calls to external services."  
→ **CONTRADICTION** (offline operation incompatible with required API calls)

### OVERLAP

Two requirements describing **the same behavior**, possibly redundant or duplicated.
They may use different wording but specify essentially the same functionality.

**Examples:**

⚠ **Req A:** "Users can log in using their email address."  
**Req B:** "The system shall support email-based authentication."  
→ **OVERLAP** (same feature, different phrasing)

⚠ **Req A:** "The system must validate email format before submission."  
**Req B:** "Email addresses shall be checked for proper syntax."  
→ **OVERLAP** (both describe email validation)

⚠ **Req A:** "Administrator must be able to access the system via web browser with HTTPS."  
**Req B:** "Administrator must be able to access the system via web browser with HTTPS."  
→ **OVERLAP** (exact duplicate)

⚠ **Req A:** "The dashboard shall display current inventory levels."  
**Req B:** "Users can view real-time stock quantities on the main screen."  
→ **OVERLAP** (same feature with different terminology)

### IMPLICIT

One requirement **silently assumes** something that the other **violates or contradicts**.
The conflict is not immediately obvious but emerges from implicit assumptions.

**Examples:**

⚡ **Req A:** "The system shall store all transaction data in a centralized database."  
**Req B:** "Each regional office must maintain complete operational independence."  
→ **IMPLICIT** (centralized database assumes connectivity; independence may require local autonomy)

⚡ **Req A:** "All user actions must be logged for audit purposes."  
**Req B:** "The system shall operate in complete privacy mode with no tracking."  
→ **IMPLICIT** (audit logging assumes tracking; privacy mode forbids it)

⚡ **Req A:** "The application shall provide instant search results."  
**Req B:** "All data must be encrypted at rest and in transit."  
→ **IMPLICIT** (instant search may assume unencrypted indexing; encryption adds latency)

⚡ **Req A:** "The system must support 10,000 concurrent users."  
**Req B:** "The application shall run on a single server with 4GB RAM."  
→ **IMPLICIT** (10K users assumes distributed architecture; single 4GB server is insufficient)

### NO_CONFLICT

Independent requirements with **no relationship or conflict**.
They describe different aspects of the system that can coexist without issues.

**Examples:**

✓ **Req A:** "The user interface must use a blue color scheme."  
**Req B:** "The system shall log all errors to a file."  
→ **NO_CONFLICT** (UI colors and error logging are independent)

✓ **Req A:** "Reports can be exported in PDF format."  
**Req B:** "Users must change passwords every 90 days."  
→ **NO_CONFLICT** (export functionality and password policy are unrelated)

✓ **Req A:** "The system shall support English and Spanish languages."  
**Req B:** "Database backups must run daily at 2 AM."  
→ **NO_CONFLICT** (language support and backup schedule are independent)

✓ **Req A:** "Search results shall be paginated with 20 items per page."  
**Req B:** "The system must validate phone number formats."  
→ **NO_CONFLICT** (pagination and validation are separate concerns)

### Decision Rules

- If requirements make **mutually exclusive demands** → **CONTRADICTION**
- If requirements describe the **same functionality** with different words → **OVERLAP**
- If one requirement's **hidden assumptions** conflict with the other → **IMPLICIT**
- If requirements are **completely independent** → **NO_CONFLICT**
- When uncertain between CONTRADICTION and IMPLICIT → prefer **IMPLICIT**
- When uncertain between OVERLAP and NO_CONFLICT → prefer **OVERLAP**
- When genuinely uncertain → prefer **NO_CONFLICT** (conflicts should be clear)

**Fill in `annotator2_label` with:** `CONTRADICTION`, `OVERLAP`, `IMPLICIT`, or `NO_CONFLICT`

---

## After You Finish

1. Return both filled CSV files to the primary annotator
2. **Do not discuss your labels** until both of you have finished independently
3. After submission, the primary annotator will compute Cohen's κ to measure agreement
4. Disagreements will be reviewed together to understand different interpretations

---

## Tips for High-Quality Annotations

### General Guidelines

- **Read carefully:** Don't rush. Each annotation should take 30-60 seconds.
- **Be consistent:** Apply the same reasoning throughout the entire task.
- **Use notes:** If uncertain, write your reasoning in the `annotator2_notes` column.
- **Take breaks:** Annotate in sessions of 30-45 minutes to maintain focus.
- **Trust your judgment:** If you've read carefully and applied the rules, your answer is valid.

### For Citation Verification (Experiment 3)

- Focus on whether the **core claim** is supported, not exact wording
- Requirements are often **formalized** from informal communications
- Be **generous** with SUPPORTS — minor rewordings are acceptable
- Only mark DOES_NOT_SUPPORT if the snippet is **clearly unrelated or contradictory**

### For Conflict Detection (Experiment 4)

- Look for **technical impossibility** (CONTRADICTION)
- Check for **redundancy** (OVERLAP)
- Consider **hidden assumptions** (IMPLICIT)
- Most pairs will be **NO_CONFLICT** — conflicts should be obvious
- Read both requirements **multiple times** before deciding

---

## Questions?

If you encounter edge cases or have questions about specific examples,
note them in the `annotator2_notes` column and continue. We'll discuss
ambiguous cases after both annotators have finished independently.

Thank you for your careful work in validating our research data!
