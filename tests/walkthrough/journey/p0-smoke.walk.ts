import { by, test } from "../harness/fixtures";
import { PEOPLE, passwordFor } from "../people";

/**
 * P0 only: proves the harness, the stage and the stand-ins work together, and
 * claims no row of the coverage matrix. It is not a journey of the product; it is
 * the smallest walk that touches everything the real ones depend on:
 *
 * - the first screen a brand-new visitor sees, through the one `open()`;
 * - real typing into a form, a click, a navigation by link;
 * - the API accepting an account, which sends mail through the provider's
 *   address, which is the mail sink, so the message appears in the inbox;
 * - the mailbox as the place the one tab goes, and a link in a mail clicked the
 *   way a person clicks it;
 * - a caption, a cursor, a screenshot and a timeline entry for every step, and an
 *   accessibility scan of each new route.
 *
 * Delete it, or keep it as the "is the stage healthy" check, when the real
 * journeys exist.
 */
test("P0 smoke: a new visitor starts an account and the confirmation mail arrives", async ({
  walk,
}) => {
  await walk.chapter("Harness check", "visitor", async () => {
    await walk.step(
      {
        id: "smoke-first-screen",
        name: "A brand-new visitor opens the product",
      },
      async () => {
        await walk.open("/");
        await walk.see(by.heading("Sign in"));
      },
    );

    await walk.step(
      {
        id: "smoke-to-register",
        name: "They have no account, so they choose to create one",
      },
      async () => {
        await walk.click(by.link("Create an account"));
        await walk.see(by.heading("Create your account"));
      },
    );

    await walk.step(
      {
        id: "smoke-register",
        name: "They fill in the company and their own details",
      },
      async () => {
        await walk.type(by.label("Company name"), "Fictional Works");
        await walk.type(by.label("First name"), "Folasade");
        await walk.type(by.label("Last name"), "Ajayi");
        await walk.type(by.label("Work email"), PEOPLE.owner.email);
        await walk.type(by.textbox(/^Password/), passwordFor("owner"));
        await walk.click(by.button("Create account"));
        await walk.seeUrl(/\/dashboard|\/setup/);
      },
    );

    await walk.step(
      {
        id: "smoke-open-mail",
        name: "They open their mail and find the confirmation message",
      },
      async () => {
        await walk.openMail();
        await walk.click(by.link("Confirm your ApproveHR email address"));
        await walk.see(by.link("Confirm my email address"));
      },
    );

    await walk.step(
      { id: "smoke-confirm", name: "They click the link in the message" },
      async () => {
        await walk.click(by.link("Confirm my email address"));
        await walk.seeUrl(/verify-email/);
      },
    );
  });
});
