import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletCard } from "@/app/(app)/payroll/payments/wallet-card";

/**
 * The wallet is one blue card: the balance, and the account to pay into. Two reads feed it and neither waits
 * for the other, and an unanswered balance is a dash and never `₦0.00` (ADR-0003).
 */

const account = {
  provider: "providus",
  accountNumber: "9912345678",
  accountName: "Crafwell Ltd / ApproveHR",
  bankName: "Providus Bank",
  bankCode: "101" as string | null,
  isDefault: true,
};

function card(over: Partial<Parameters<typeof WalletCard>[0]> = {}) {
  return (
    <WalletCard
      balanceKobo={562077855}
      accounts={[account]}
      loading={false}
      error={null}
      onRetry={vi.fn()}
      {...over}
    />
  );
}

describe("the balance", () => {
  it("is written in full, with the kobo", () => {
    render(card());
    expect(screen.getByText("₦5,620,778.55")).toBeInTheDocument();
  });

  it("is a dash while it has not arrived, never a zero", () => {
    render(card({ balanceKobo: null }));
    expect(screen.getByTitle("Not loaded yet")).toBeInTheDocument();
    expect(screen.queryByText(/₦0/)).toBeNull();
  });

  it("is a real zero when the wallet holds nothing", () => {
    render(card({ balanceKobo: 0 }));
    expect(screen.getByText("₦0.00")).toBeInTheDocument();
  });
});

describe("the account to pay into", () => {
  it("shows the number, the bank, its code and the account name, with a way to copy the number", () => {
    render(card());
    expect(screen.getByText("9912345678")).toBeInTheDocument();
    expect(screen.getByText("Providus Bank")).toBeInTheDocument();
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByText("Crafwell Ltd / ApproveHR")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy number" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pay into this account")).toBeInTheDocument();
  });

  it("says nothing about a bank code the provider did not give", () => {
    render(card({ accounts: [{ ...account, bankCode: null }] }));
    expect(screen.queryByText(/code/i)).toBeNull();
  });

  it("marks the suggested one only where there is a choice", () => {
    const { rerender } = render(card());
    expect(screen.queryByText("Suggested")).toBeNull();
    rerender(
      card({
        accounts: [
          account,
          { ...account, accountNumber: "7821203344", isDefault: false },
        ],
      }),
    );
    expect(screen.getAllByText("Suggested")).toHaveLength(1);
    expect(screen.getByText("Pay into any of these")).toBeInTheDocument();
  });

  it("says there is no account yet, when there is none", () => {
    render(card({ accounts: [] }));
    expect(screen.getByText("No funding account yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy number" })).toBeNull();
  });

  it("does not invent one offline", () => {
    render(card({ accounts: null }));
    expect(screen.getByText(/none to read offline/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy number" })).toBeNull();
  });

  it("holds its place while loading, and keeps the balance in view", () => {
    render(card({ accounts: null, loading: true }));
    expect(screen.getByText("Loading the wallet")).toBeInTheDocument();
    expect(screen.getByText("₦5,620,778.55")).toBeInTheDocument();
  });

  it("says a failed read once, in the card, and keeps the balance in view", () => {
    render(card({ accounts: null, error: new Error("boom") }));
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("₦5,620,778.55")).toBeInTheDocument();
  });
});
