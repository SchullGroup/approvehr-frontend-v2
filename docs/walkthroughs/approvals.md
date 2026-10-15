# Walkthrough: the approvals inbox

For somebody who has to **use** the inbox, or explain it. No code. Every on-screen label is quoted
exactly as the product shows it.

## In one paragraph

`/approvals` (the sidebar item **My approvals**, with a count beside it) is where everything waiting on
a decision from you lands, whichever module raised it. Each line is one **entry**. You open it, read
what is being asked, and either **Approve** or **Reject** it. A rejection needs a reason, and the person
who asked is told that reason.

## Words used here

| Word             | Means                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry**        | One line in your inbox. It points at a request somebody raised — a record change, an attendance correction, leave — and is not the request itself. |
| **Kind**         | The badge on an entry saying what sort of request it is, for example "Record change".                                                              |
| **Withdrawn**    | The status of an entry that was closed because the same person raised the same matter again. The newer request is the live one.                    |
| **Bank details** | One entry that covers both the bank name and the account number, so you decide them together.                                                      |
| **Rejected**     | The decision label for a plain no. The person is told why.                                                                                         |

## The two views

A switch at the top, **Which approvals to show**, has two options:

| Option             | Answers                                                   |
| ------------------ | --------------------------------------------------------- |
| **Waiting on you** | What needs your decision. This is the view you land on.   |
| **Sent by you**    | What you raised yourself, and who it is sitting with now. |

Under **Waiting on you** you also get the counts **Waiting on you**, **Value at stake**,
**Has a deadline** and **Waiting 5+ days**, and a filter, **Filter approvals**, with **Moves money**,
**People** and **Needs attention**. The list is ordered with anything that has a deadline first, then
oldest first, so the entry that has waited longest is on top.

## Which entries you can decide here

You can decide most kinds from this screen. **Payroll runs, loans, expenses, requisitions and offers
are the exception**: each has a check that only its own screen can make, so the line shows
**Open** and the kind (for example "Open loan") instead of Approve and Reject, and takes you there.

## Steps

Each step says where you are, who can do it, what to click, and what you will see.

### 1. Read the entry

|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Where**      | `/approvals`, view **Waiting on you**                                                           |
| **Who**        | Anybody a request has been routed to                                                            |
| **Click**      | Nothing yet — read the line                                                                     |
| **You'll see** | A title, a one-line summary of what changes, the badge for its kind, and how long it has waited |

For a bank change the line reads **Bank details — Ada Okafor** and the summary shows both halves, for
example `Bank: Access Bank → GTBank · Account number: ••••4444 → ••••3333`. The summary shows only the
last four digits of an account number.

### 2. Approve

|                |                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Where**      | The entry's line                                                                                                      |
| **Who**        | The person it is routed to                                                                                            |
| **Click**      | **Approve**                                                                                                           |
| **You'll see** | A toast, **«title» approved**, and the line leaves the list. For a record change, the person is told it was approved. |

For **Bank details**, one click approves the bank name and the account number together.

### 3. Reject, with a reason

|                |                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **Where**      | The entry's line                                                                                              |
| **Who**        | The person it is routed to                                                                                    |
| **Click**      | **Reject**                                                                                                    |
| **You'll see** | A box titled **Reject**, reading `Rejecting “…”. They see what you write here.` with a required field **Why** |

Press **Reject** in the box with the field empty and it will not send: it shows
**Write a line so they know why.** Write a reason and press **Reject**. You then see the toast
**«title» rejected** — "Your reason is kept with the decision." — and the line leaves the list.

The person is notified: **Your bank details change was rejected** (or the field's own name), with the
change and then `Reason:` and what you wrote.

**If the rejection fails** — the connection drops, say — the box stays open, shows the server's own
sentence, and keeps what you typed. Nothing is lost.

### 4. When somebody else got there first

|                |                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Where**      | An entry that has already been decided, or replaced, since the page loaded                                                                     |
| **Who**        | Any approver                                                                                                                                   |
| **Click**      | **Approve** or **Reject** as normal                                                                                                            |
| **You'll see** | A message such as **That did not work** with the reason (for example "That was already approved."), and the list refreshes so the line is gone |

When this happens inside the **Reject** box, the message appears in the box and what you typed is kept,
so you can see what you were about to say. The line then leaves the list on its own.

### 5. Undo

|                |                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **Where**      | The list of decisions you have just made, below the queue, each with its own badge (**Approved**, **Rejected**) |
| **Who**        | The person who decided                                                                                          |
| **Click**      | **Undo** beside the line                                                                                        |
| **You'll see** | **Back in the queue** — "«title» is waiting on a decision again."                                               |

If it cannot be undone you see **Could not undo that** with the reason.

## Deliberate behaviours

These are decisions, not accidents. Each one has a reason.

1. **Raising the same thing again replaces the earlier entry.** If an employee changes their phone number
   three times before you look, you see **one** entry, for the latest. The earlier ones are closed
   (status **Withdrawn**) with the note "Replaced by a newer request for the same field." The same is true of an
   attendance correction for one day: "Replaced by a newer request for the same day."
2. **Bank name and account number are one entry.** Deciding them separately would let you approve an
   account number you were never shown beside the bank it belongs to. A newer bank request replaces
   the older one: "Replaced by a newer request for the same bank details."
3. **Requests raised before this change keep their own entries.** Approving one of those approves
   only that field. They look the way they always did.
4. **It says Reject, not Send back.** A plain no is a no. **Send back** still exists where something is
   genuinely returned for revision: leave on `/people/leave` and objectives on `/performance/approvals`.
5. **A reason is required, and it reaches the person.** The box says "They see what you write here",
   and they do: the rejection arrives as a notification carrying it.
6. **The bank-change safety notice is sent once, for the group.** When a bank change is approved, the
   people who can edit employee records are told **Bank details changed — «name»**, with the change
   in the body, and the link goes to that person's record. It is sent once for the bank name and
   account number together, never once per field, and a company cannot switch it off.
7. **Holiday entries say Decline.** A public-holiday entry was raised by the system, not by a person,
   so there is nobody to tell. **Decline** keeps your note with the decision instead of sending it.

## What the person who asked sees

|                       |                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Approved**          | **Your bank details change was approved** — with what changed, for example the bank and last digits. |
| **Rejected**          | **Your bank details change was rejected** — with what changed, then `. Reason:` and your reason.     |
| **Where they see it** | In their notifications; the link goes to their profile.                                              |

## Cannot be done from this screen

- **Closing or discarding an entry without deciding it.** There is no third outcome: an entry is
  approved, rejected, or replaced by a newer one. Whether an approver should be able to close one
  without a decision has been raised and is not built.
- **Rejecting a payroll run, loan, expense, requisition or offer.** Those are decided on their own
  screens (see above).
