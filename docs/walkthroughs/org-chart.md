# Walkthrough: the org chart

For somebody who has to **use** the org chart, or explain it. No code. Every on-screen label is quoted
exactly as the product shows it.

## In one paragraph

**Org chart** (`/people/org-chart`, under **Core HR**, in its **People** section of the sidebar) shows who is in the company
and how they are arranged, in two ways you switch between. **Chart** draws the reporting line the way
an org chart is normally drawn: a card for each person, joined to their manager, with the top of the
company at the top. **By department** lists the departments and who is in each. Anybody who can sign in
can open it. Changing anything is a separate matter and needs a permission (step 6). **No pay appears
anywhere on it**, whoever you are: the screen is the one most likely to be put on a projector, and a
department of one would print that person's salary beside their name.

## Words used here

| Word                    | Means                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reporting line**      | Who each person reports to. It comes from the manager set on their own record.                                                                    |
| **Chart**               | The view that draws the reporting line, top-down.                                                                                                 |
| **By department**       | The view that lists departments, each with its people. It is also where **Arrange** lives.                                                        |
| **No manager set**      | A dashed card at the top of the chart. People with no manager on their record hang from it, because they cannot honestly be ranked under anybody. |
| **Without a manager**   | The count of people whose record has no manager. It reads "nobody has one set yet" when that is everybody.                                        |
| **Not in a department** | The count of people with no department. They appear at the bottom of **By department**.                                                           |

## Opening it

The screen opens on **Chart** when anybody in the company has a manager set. When nobody does it opens
on **By department** instead, because a chart of a company with no reporting lines is one card over a
row of strangers. You can switch either way with **How to draw the company**, and the search box
**Find a person, a job title or a department** works in both.

Four counts sit above the views: **People**, **Departments** (with "N hidden" when some are archived),
**Not in a department** and **Without a manager**.

## Steps

#### 1. Read the chart

|                |                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Where**      | `/people/org-chart`, **Chart**                                                                                                                                                              |
| **Who**        | Anybody who can sign in                                                                                                                                                                     |
| **Click**      | A person's card, which opens their record                                                                                                                                                   |
| **You'll see** | A card per person with their name, job title, then department and location. Lines join each card to their manager. A line above the chart says "Showing 14 of 30 people" (the numbers vary) |

It opens two levels deep: the top person and their direct reports. A manager whose people are hidden
carries a chip with how many people are under them, so a closed branch is never mistaken for somebody
with nobody below them. The chip is a button, labelled "Show the 12 people under Ada Obi" and, once
open, "Hide the people under Ada Obi".

A manager with three or more reports who manage nobody does not spread them across the page: those
people hang in one column beneath the manager. A team of seventeen is a tall column, not four thousand
pixels of cards.

#### 2. Open and close branches

|                |                                                                           |
| -------------- | ------------------------------------------------------------------------- |
| **Where**      | `/people/org-chart`, **Chart**                                            |
| **Click**      | **Expand all**, **Collapse all**, or the chip on any one card             |
| **You'll see** | The drawing reshapes. Opening one card keeps that card under your pointer |

**Expand all** shows everybody and suits a company small enough to see whole. **Collapse all** returns
to the top person and their direct reports.

#### 3. Zoom, fit and move around

|                |                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Where**      | `/people/org-chart`, **Chart**                                                                                          |
| **Click**      | **Zoom out**, **Zoom in** (50%, 65%, 80%, 100% and 125%), or **Fit to width**                                           |
| **You'll see** | The percentage between the two buttons changes. **Fit to width** picks the size that makes the whole drawing fit across |

The chart sits in a box of its own. Drag the background with the mouse to move around, or focus the box
and use the arrow keys ("Org chart. Use the arrow keys or drag to see more of it."). On a phone it
scrolls sideways with a finger while the page itself still scrolls normally. A wide chart is a window
onto part of the company at that size, and **By department** is the easier view there.

#### 4. Find somebody

|                |                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Where**      | `/people/org-chart`, either view                                                                                                                                                           |
| **Click**      | The box **Find a person, a job title or a department**, and type                                                                                                                           |
| **You'll see** | On **Chart**: every match highlighted, with the people above each one so nothing floats loose, and "3 matches, with the people above them". Otherwise "Nothing matches" and what you typed |

A search opens the path to every match, even inside a closed branch, because a match nobody can see is
no use. **Expand all** and **Collapse all** step aside while you search and return when the box is empty.

#### 5. When nobody has a manager, or somebody has two

|                |                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Where**      | `/people/org-chart`, **Chart**                                                                                                                                                                                                                                        |
| **You'll see** | More than one person at the top hang from a dashed **No manager set** card ("12 people in all"), with a line saying "These people have no manager set on their record, so they hang from one card. Set a manager on each record and the chart fills in beneath them." |

The fix is on each person's record, not here. If the reporting lines loop back on themselves (A reports
to B and B to A), a warning headed **Some reporting lines loop back on themselves** names the people. They
are drawn without a manager until somebody corrects who they report to.

#### 6. Arrange the departments

|                |                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Where**      | `/people/org-chart`, **By department**                                                                                                                                                                  |
| **Who**        | Anybody who can change the company's structure (settings) or move people between departments (people records). Everybody else gets the screen with no controls                                          |
| **Click**      | **Arrange**, then drag a person onto a department to move them, or a department onto another to nest it. The **Move** button beside each one does the same without a mouse. **Done arranging** finishes |
| **You'll see** | A note headed **Arranging**: "Every change saves as you make it." While you drag a department, a strip appears: "Drop here to make it a top-level department"                                           |

**Arrange** is absent on **Chart**, not greyed out: arranging moves people between departments and
departments between parents, and the chart draws neither. A department is shown with six people and
says how many more there are; opening one does not open the rest.

The department's cost is not on this screen. It is on **Departments**, beside it in the same section, which somebody
opens on purpose to look at cost.

## When it will not work

| You see                          | Why                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **The org chart needs the API**  | There is no server. It is built from the departments and the reporting line on everybody's record, which only exist on one. |
| **There is nobody to chart yet** | No people or departments. "Add people and departments and the shape of the company appears here."                           |

## Not covered here

This walkthrough was written from the screen's source and its tests, not by clicking through a running
copy. Not checked: a company of hundreds, touch-dragging on a real phone, and what a department head or a
line manager is shown.
