# Work in review answers: a starter for the assessments a company may need first

**Not legal advice. A starter for counsel.** This is not a filed assessment, not a valid one, and not a
substitute for one. It is a plain-language worksheet for the person at a customer who looks after data
protection, to fill in before somebody with the Manage settings permission turns on **Work in review answers**
(Settings, Appraisal scoring, Records). It describes what the product does, which is a fact the product's own
code and tests can be read against, and it leaves every decision that is the company's own as a blank to fill.

Written 12 November 2026 for the first pilot of Stage 3 of the Projects-in-Performance research. Where it
quotes the law it quotes it the way that research did, and **those texts have not been checked again for this
page**; the research's own list of what it did not verify is at the end.

## 1. What switching it on does

It is **off for every company**, and it only does anything while Projects is on. Turning it off keeps
everything already written and stops anything new.

| What | What a person can do | Who can read it |
| ---- | -------------------- | --------------- |
| **Pins** | While writing their own self-review, attach up to five finished tasks from their own list to an answer, each with an optional note of up to 280 characters in their own words. Taken off again until the review is sent. | Whoever can read that review: the person, their manager, an assigned appraiser, and HR. |
| **Flags** | Say that an item on their own finished-work list is wrong, with a reason of 3 to 280 characters. They can change it or take it back. It removes nothing from the list. | Whoever can read that person's work for that review period: the person, those who lead them, an assigned appraiser in that period, and HR. |
| **Colleagues who shared a project** | Nothing to write. When feedback is asked for, or an appraiser is chosen, the people who were members of a project with the person are listed first and labelled "Shared 2 projects". | The person themselves, and people who hold the records permission (the appraiser map is theirs). |

**None of it reaches a mark.** No score, band, flag or ranking reads a pin, a flag or a shared-project count,
and the code is tested to show it. Nothing is chosen for anybody: a person picks which task to pin, and a
person picks which colleague to ask. No model reads any of it.

## 2. What is processed and kept

**The minimum, on purpose.** The product keeps what it needs to show a reader which task a person pointed at
and when, and nothing a person typed into the task.

| Kept | Where |
| ---- | ----- |
| For a pin: the task's id and key, its kind (task, story or problem), whether it was on the person's own task list or a project board, which project, the day it was finished, its due date, whether it met it, whether it sat under an objective, who set it when somebody else did, **the person's own note**, who pinned it and when | One row per pin |
| For a flag: the task's id and key, **the person's own reason**, who flagged it and when | One row per flag, per task, per person, per review period |
| For shared projects: **nothing**. It is read from project membership when somebody asks and is not stored | Not stored |

| Never kept | |
| ---------- | --- |
| A task's **title, description, comments, attachments or labels** | A title can hold health or trade-union details, which the research says the Nigeria Data Protection Act (NDPA) names as sensitive. A reader opens the task by its id to read it as it is now. |
| Time spent, points, activity or history | Not read and not kept. |
| The names of the projects two people shared | Only the count. |

**What the product cannot control: the two free-text boxes.** A person's note on a pin and reason on a flag
are their own words, and the product does not read, scan or limit them beyond their length. Tell people what
not to write in them (section 5).

The picker shows a task's live title to the person who is choosing, so they can tell their tasks apart. The
dialog says it is not saved with the pin.

## 3. How long it is kept

**The product has no retention period for these.** A pin is held as long as the review it belongs to, and a
flag as long as the review period and the person it belongs to. Deleting a review deletes its pins and not
the flags; deleting the review period, or the person, deletes both. Switching the setting off does not delete anything and does not hide a pin on a review that was already
sent, because it is part of what was sent and may be disputed, **or a flag**: a flag that was raised stays on
the list and in its count for whoever could read it, and the person can still take it back. Only a new pin, and
a new or changed flag, stop.

> **Company to decide:** how long reviews are kept, and whether pins and flags should go sooner. The research
> says NDPA section 24(1) requires data "limited to the minimum necessary", retained no longer than necessary,
> and "accurate, complete, not misleading". It reads GAID Article 49(3) as ending storage "not later than six
> (6) calendar months" after the purpose is accomplished unless a law says otherwise, and Article 49(4) as
> allowing data to be kept to defend a legal claim. The record kept with a final rating (Records, **Work kept
> with a final rating**) has a company-chosen period and no default; pins and flags do not yet. Ask counsel
> whether they need one.

## 4. Does the company need to file an assessment first?

**The research could not settle it.** What it read, in its own words:

| Provision, as the research cited it | Why it might bear here |
| ----------------------------------- | ---------------------- |
| GAID Article 28(3): a data privacy impact assessment is mandatory, and filed with the data protection commission, for "Evaluation or scoring (profiling)", "Automated decision-making with legal or similar significant effects" and "Systematic monitoring". Article 28(4): a certified data protection officer vets it. | Nothing here scores or decides, which is the point of building it as evidence a person reads. Whether a performance module as a whole is "evaluation" is the open question. |
| NDPA section 37: the right not to be subject to a decision based solely on automated processing that produces "legal or similar significant effects", with human intervention, a say and a way to contest it. | Every decision about a mark is made by a named person, who writes the reason. Nothing is pre-graded. |
| GAID Article 26(2)(d): a controller relying on legitimate interest should eliminate processing that "may lead to behavioural monitoring or profiling". The GAID puts the template for a legitimate-interest assessment in Schedule 8. | The company chooses its own lawful basis. This feature shows what a person chose to show. |
| GAID Article 42(5)(c) and Article 43: an outcome "adversely different from the original expectation" is a disparate outcome that can bring liability, and Article 43 asks for disparate-outcome checks when AI is used. | No model reads any of this. See the risks below. |

The research read the commission's own texts and **found no guidance on employee monitoring and no Nigerian
case on it**. Whether the performance module already needs a filed assessment, or whether a
manager-confirmed score counts as "solely automated", is a question for counsel and not one the product can
answer.

**Who is the controller.** The research's reading is that the customer is the data controller and ApproveHR its
processor. That is a contractual question for the customer and counsel, and this page does not settle it.

## 5. Worksheet for the company's data protection officer

Fill in what is yours. Nothing below is pre-answered, because each is the company's decision.

| Question | The company's answer |
| -------- | -------------------- |
| **Purpose.** What does the company want people to be able to do with this, and why is a review answer a better place for it than the list that is already there? | |
| **Lawful basis** the company relies on. If legitimate interest: the balancing the company has done, on its own template. | |
| **Necessity.** Could the purpose be met with less (for example pins with no note, or no colleague ordering)? Each of the three parts can be judged on its own, but they share one switch. | |
| **Who reads what.** Is "whoever can read the review" (including HR) right for pins, and "whoever can read the person's work" right for flags? | |
| **Retention** for pins and flags (section 3). | |
| **What people are told**, where, and when. Staff should be told **before** it is on. The pilot checklist has the sentences the product itself relies on. | |
| **Guidance on the free-text boxes.** What the company asks people not to write (health, union membership, other people's details). | |
| **How a person contests it.** The product gives them: unpin (until the review is sent), flag an item as wrong, and the optional comment they can add when they acknowledge a rating. Is that enough, and where does the company say so? | |
| **Who vets it** (the company's data protection officer) and **when it was reviewed**. | |

## 6. Risks the research names, and what the product does about each

| Risk | In the product |
| ---- | -------------- |
| **People pin the flattering items.** | Five to an answer, and the full list of finished work is one press away on the same page for the reader. A pin says nothing about the rest. |
| **Missing data read as low performance** (a team that tracks work elsewhere has an empty list). | Absent is never zero. A person with no finished tasks reads "No finished tasks were recorded for you on the project boards in this period", which says nothing about the work. Nothing is offered while Projects is off. |
| **Favouring close collaborators** (colleagues who shared a project are listed first). | It orders a list the person still picks from. It is a count of shared projects and no more. |
| **More data is not better feedback** (the research cites Kluger and DeNisi: over a third of the feedback interventions they reviewed lowered performance). | The evidence is for reading while a review is being written. It is not a live dashboard and sends no alert. |
| **Process decides a dispute, not a task count** (the research cites a National Industrial Court case). | None of this stands in for a warning, a hearing or a plan to improve. It is evidence beside a person's own words. |

Not from the research, and added here: a list of tracked work can look objective while carrying the biases
of what gets tracked. Nothing in the product turns it into a score, and a flag lets a person say an item is wrong.

## 7. Pilot checklist

The research's gate for this stage is an assessment ready to file, **and one pilot company whose staff were
told first**. Nothing here turns that into a rule the product enforces: it asks before the switch is on and says
so in plain words.

Before switching it on at the pilot:

- [ ] The company's data protection officer has read this page and section 5 is filled in or consciously left.
- [ ] Staff have been **told first**, in the company's own words, where they will see it: what a person can
      attach, who reads it, that nothing changes a mark, that task titles are not kept, how to take a pin off
      or flag an item, and what not to write in a note.
- [ ] Projects is on and people really do track their work in it. A team that does not has nothing to pin, and
      the feature will be empty by design.
- [ ] Managers have been told that a short list is not a short record of work, and that a flag is the person's
      word and not a correction.
- [ ] Somebody has agreed how long reviews, and so pins and flags, are kept.
- [ ] The company knows how to turn it off (one press, no question) and that off keeps what was written.

During and after one review period:

- [ ] Do people use pins? Do appraisers open the full list as well, or only the pins?
- [ ] Does anybody flag an item, and what does the reader do with it?
- [ ] Does anybody say a pin or a note was something they did not mean to show?
- [ ] Do managers ask for something the product deliberately does not do (a score, a ranking, an alert)? If so,
      say no and write down why.
- [ ] **If managers never open the evidence, stop.** The research says so for the first stages, and it holds
      here.

## 8. What stays open

- **Counsel's items.** Whether an assessment must be filed before this is on, which template, who files it, and
  whether the legitimate-interest balance holds. Retention for pins and flags.
- **What the research did not verify.** When the GAID came into force (commentaries say 19 September 2025), the
  commission's enforcement record, and limitation periods. It read the NDPA sections and GAID articles above in
  the primary texts; they have not been read again for this page.
- **Not built, by design.** Any figure, band, ranking or alert made from this; any use of it by a model; and
  anything that fills an answer in for a person.
